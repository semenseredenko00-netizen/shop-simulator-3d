import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';

type ProductId = 'milk' | 'bread' | 'eggs' | 'juice' | 'chips' | 'cereal';

type QualityMode = 'low' | 'medium' | 'high';

type SaveData = {
  money: number;
  day: number;
  reputation: number;
  storeLevel: number;
  purchasedProducts: ProductId[];
  lastUpdated: number;
};

type CustomerOrder = {
  name: string;
  items: ProductId[];
  price: number;
  mood: number;
};

type ProductItem = {
  id: ProductId;
  label: string;
  price: number;
  color: string;
  position: THREE.Vector3;
  mesh: THREE.Group;
  taken: boolean;
};

type CustomerNPC = {
  mesh: THREE.Group;
  name: string;
  order: CustomerOrder;
  target: THREE.Vector3;
  speed: number;
  queueIndex: number;
  isAtCheckout: boolean;
  waitTime: number;
};

const STORAGE_KEY = 'shop-sim-save-v1';
const productCatalog: Record<ProductId, { label: string; price: number; color: string }> = {
  milk: { label: 'Milk', price: 3.2, color: '#dbeafe' },
  bread: { label: 'Bread', price: 2.8, color: '#f6d5a5' },
  eggs: { label: 'Eggs', price: 4.5, color: '#fef3c7' },
  juice: { label: 'Juice', price: 5.6, color: '#fca5a5' },
  chips: { label: 'Chips', price: 3.9, color: '#f9a8d4' },
  cereal: { label: 'Cereal', price: 6.2, color: '#fdba74' },
};

const variantOrder: ProductId[] = ['milk', 'bread', 'eggs', 'juice', 'chips', 'cereal'];

const moneyNode = document.querySelector('#money') as HTMLSpanElement;
const dayNode = document.querySelector('#day') as HTMLSpanElement;
const storeNode = document.querySelector('#storeLevel') as HTMLSpanElement;
const orderListNode = document.querySelector('#orderList') as HTMLUListElement;
const cartListNode = document.querySelector('#cartList') as HTMLUListElement;
const messageNode = document.querySelector('#messageBox') as HTMLDivElement;
const qualityButton = document.querySelector('#qualityButton') as HTMLButtonElement;
const upgradeButton = document.querySelector('#upgradeButton') as HTMLButtonElement;
const dayButton = document.querySelector('#dayButton') as HTMLButtonElement;
const interactButton = document.querySelector('#interactBtn') as HTMLButtonElement;
const scanButton = document.querySelector('#scanBtn') as HTMLButtonElement;

const appState: SaveData = loadSave();
const queueLine: CustomerNPC[] = [];
const productMeshes: ProductItem[] = [];
const interactables: Array<{ mesh: THREE.Object3D; type: 'product' | 'checkout'; onInteract: () => void }> = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfeaf4');
scene.fog = new THREE.Fog('#dfeaf4', 8, 36);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 1.7, 10);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtaoPass.enabled = true;
composer.addPass(gtaoPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 1, 0.08);
composer.addPass(bloom);
const smaa = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
composer.addPass(smaa);
const outputPass = new OutputPass();
composer.addPass(outputPass);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

const player = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  height: 1.7,
  moveSpeed: 2.75,
  sprintFactor: 1.35,
  cart: new Map<ProductId, number>(),
  enoughToCheckout: false,
};

const pointerState = {
  active: false,
  locked: false,
  lastX: 0,
  lastY: 0,
};

const touchState = {
  active: false,
  dx: 0,
  dy: 0,
  moved: false,
  joystick: { x: 0, y: 0 },
};

const world = {
  storeLevel: appState.storeLevel,
  day: appState.day,
  money: appState.money,
  reputation: appState.reputation,
  customers: [] as CustomerNPC[],
  quality: 'medium' as QualityMode,
  checkoutPoint: new THREE.Vector3(4.3, 0, 2.6),
  forwardGate: new THREE.Vector3(-7.5, 0, 0),
};

setupUI();
setupLighting();
setupEnvironment();
createPlayerArea();
loadRealisticAssets();
createStoreLayout();
createCustomers();
applyQuality(world.quality);
updateHud();
updateOrders();

renderer.domElement.addEventListener('click', () => {
  if (!pointerState.locked) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  pointerState.locked = document.pointerLockElement === renderer.domElement;
  if (!pointerState.locked) {
    messageNode.textContent = 'Click to resume. Use WASD + mouse.';
  }
});

document.addEventListener('mousemove', (event) => {
  if (!pointerState.locked || window.innerWidth >= 900) {
    return;
  }

  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0017;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.3, 1.3);
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE') {
    interactClosest();
  }

  if (event.code === 'KeyQ') {
    cycleQuality();
  }

  if (event.code === 'KeyH') {
    upgradeStore();
  }

  if (event.code === 'KeyN') {
    nextDay();
  }
});

const keyState: Record<string, boolean> = {};
document.addEventListener('keydown', (event) => {
  keyState[event.code] = true;
});
document.addEventListener('keyup', (event) => {
  keyState[event.code] = false;
});

renderer.domElement.addEventListener('mousedown', () => {
  if (!pointerState.locked) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointermove', (event) => {
  if (!pointerState.locked) {
    return;
  }

  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0017;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.25, 1.25);
});

setupTouchControls();

interactButton.addEventListener('click', () => interactClosest());
scanButton.addEventListener('click', () => scanCheckout());
qualityButton.addEventListener('click', () => cycleQuality());
upgradeButton.addEventListener('click', () => upgradeStore());
dayButton.addEventListener('click', () => nextDay());

animate();

function setupUI() {
  document.body.style.userSelect = 'none';
  qualityButton.textContent = `Quality: ${world.quality[0].toUpperCase() + world.quality.slice(1)}`;
}

function setupLighting() {
  const hemi = new THREE.HemisphereLight('#dfeaf4', '#5d6b7c', 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff6d8', 1.5);
  sun.position.set(8, 15, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  scene.add(sun);

  addCeilingLight(-6, 0, 0);
  addCeilingLight(0, 0, 0);
  addCeilingLight(6, 0, 0);
}

function addCeilingLight(x: number, y: number, z: number) {
  const lampBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.2, 1.5),
    new THREE.MeshStandardMaterial({ color: '#d9dee6', emissive: '#fff4d6', emissiveIntensity: 0.2, metalness: 0.5, roughness: 0.35 })
  );
  lampBase.position.set(x, 3.2, z);
  lampBase.castShadow = true;
  lampBase.receiveShadow = true;
  scene.add(lampBase);

  const light = new THREE.PointLight('#fff4d6', 18, 18, 2);
  light.position.set(x, 2.9, z);
  light.castShadow = true;
  scene.add(light);
}

function setupEnvironment() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(32, 0.25, 32),
    new THREE.MeshPhysicalMaterial({
      color: '#d8d9d7',
      metalness: 0.2,
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.25,
    })
  );
  floor.position.y = -0.13;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#eef2f7', roughness: 0.95 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(32, 6, 0.28), wallMaterial);
  backWall.position.set(0, 3, -16);
  scene.add(backWall);

  const sideWallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6, 32), wallMaterial);
  sideWallLeft.position.set(-16, 3, 0);
  scene.add(sideWallLeft);

  const sideWallRight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6, 32), wallMaterial);
  sideWallRight.position.set(16, 3, 0);
  scene.add(sideWallRight);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(32, 0.3, 32), new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.9 }));
  ceiling.position.set(0, 6.2, 0);
  scene.add(ceiling);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.2, 0.15),
    new THREE.MeshStandardMaterial({ color: '#111827', emissive: '#111827', emissiveIntensity: 0.4 })
  );
  sign.position.set(0, 4.3, -15.84);
  scene.add(sign);
}

function createPlayerArea() {
  const checkoutCounter = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.58, roughness: 0.38 })
  );
  checkoutCounter.position.set(6.4, 0.7, 4.4);
  checkoutCounter.castShadow = true;
  checkoutCounter.receiveShadow = true;
  scene.add(checkoutCounter);

  const checkoutDisplay = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.7, 0.2),
    new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6, metalness: 0.7 })
  );
  checkoutDisplay.position.set(6.4, 1.6, 5.2);
  scene.add(checkoutDisplay);

  const registrationLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.09, 7.2),
    new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.8, metalness: 0.4 })
  );
  registrationLine.position.set(3.2, 0.06, 1.4);
  scene.add(registrationLine);

  const rack = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 2.1, 1),
    new THREE.MeshStandardMaterial({ color: '#f5f5f4', roughness: 0.8, metalness: 0.25 })
  );
  rack.position.set(-7.5, 1.05, 0);
  rack.castShadow = true;
  rack.receiveShadow = true;
  scene.add(rack);

  interactables.push({ mesh: rack, type: 'checkout', onInteract: scanCheckout });
}

function createStoreLayout() {
  const shelfPositions = [
    new THREE.Vector3(-11, 0, -7),
    new THREE.Vector3(-11, 0, 0),
    new THREE.Vector3(-11, 0, 7),
    new THREE.Vector3(-2.5, 0, -7),
    new THREE.Vector3(-2.5, 0, 7),
  ];

  const productDef = [
    { id: 'milk', item: productCatalog.milk, position: new THREE.Vector3(-10.8, 1, -6.1) },
    { id: 'bread', item: productCatalog.bread, position: new THREE.Vector3(-10.8, 1, -0.7) },
    { id: 'eggs', item: productCatalog.eggs, position: new THREE.Vector3(-10.8, 1, 7.2) },
    { id: 'juice', item: productCatalog.juice, position: new THREE.Vector3(-2, 1, -5.8) },
    { id: 'chips', item: productCatalog.chips, position: new THREE.Vector3(-2, 1, 7.7) },
    { id: 'cereal', item: productCatalog.cereal, position: new THREE.Vector3(-2.1, 1.1, 1.2) },
  ];

  shelfPositions.forEach((pos, index) => {
    const shelf = buildShelfFallback();
    shelf.position.copy(pos);
    shelf.rotation.y = Math.PI * 0.5;
    scene.add(shelf);

    if (index === 0 || index === 1 || index === 2) {
      shelf.position.x = -8.5 + (index * 1.5);
    }
  });

  productDef.forEach(({ id, position, item }) => {
    const product = buildProductFallback(id, item.label, item.color, item.price);
    product.position.copy(position);
    scene.add(product);
    productMeshes.push({
      id,
      label: item.label,
      price: item.price,
      color: item.color,
      position: position.clone(),
      mesh: product,
      taken: false,
    });
  });
}

function buildShelfFallback() {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.75, metalness: 0.36 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: '#fafaf9', roughness: 0.7, metalness: 0.15 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.6), frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const shelf1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), shelfMat);
  shelf1.position.y = 0.55;
  group.add(shelf1);

  const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), shelfMat);
  shelf2.position.y = -0.1;
  group.add(shelf2);

  const shelf3 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), shelfMat);
  shelf3.position.y = -0.75;
  group.add(shelf3);

  return group;
}

function buildProductFallback(id: ProductId, label: string, color: string, price: number) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.38, 0.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 })
  );
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const labelBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: '#111827', emissive: '#111827', emissiveIntensity: 0.15 })
  );
  labelBoard.position.set(0, 0.24, 0.02);
  group.add(labelBoard);

  const tag = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: '#f8fafc',
      transparent: true,
      opacity: 1,
    })
  );
  tag.scale.set(0.2, 0.12, 1);
  tag.position.set(0, 0.24, 0.08);
  group.add(tag);

  const productMeta = { id, label, price, color };
  (group as any).userData = productMeta;
  return group;
}

function updateHud() {
  moneyNode.textContent = `$${world.money.toFixed(2)}`;
  dayNode.textContent = `Day ${world.day}`;
  storeNode.textContent = `Store LVL ${world.storeLevel}`;
  qualityButton.textContent = `Quality: ${world.quality[0].toUpperCase() + world.quality.slice(1)}`;
}

function updateOrders() {
  const current = world.customers[0]?.order ?? null;
  orderListNode.innerHTML = '';

  if (!current) {
    const li = document.createElement('li');
    li.textContent = 'No active queue';
    orderListNode.appendChild(li);
    return;
  }

  for (const itemId of current.items) {
    const item = productCatalog[itemId];
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.label}</span><span>$${item.price.toFixed(2)}</span>`;
    orderListNode.appendChild(li);
  }

  const total = document.createElement('li');
  total.innerHTML = `<strong>Total</strong><strong>$${current.price.toFixed(2)}</strong>`;
  orderListNode.appendChild(total);

  updateCartHud();
}

function updateCartHud() {
  cartListNode.innerHTML = '';
  if (player.cart.size === 0) {
    const li = document.createElement('li');
    li.textContent = 'Empty cart';
    cartListNode.appendChild(li);
    return;
  }

  for (const [id, count] of player.cart.entries()) {
    const info = productCatalog[id];
    const li = document.createElement('li');
    li.innerHTML = `<span>${info.label} x${count}</span><span>$${(info.price * count).toFixed(2)}</span>`;
    cartListNode.appendChild(li);
  }
}

function createCustomers() {
  const queueSpots = [
    new THREE.Vector3(-2.2, 0, 6.0),
    new THREE.Vector3(-2.2, 0, 4.5),
    new THREE.Vector3(-2.2, 0, 3.0),
    new THREE.Vector3(-2.2, 0, 1.5),
    new THREE.Vector3(-2.2, 0, 0.0),
  ];

  const names = ['Ava', 'Noah', 'Liam', 'Mia', 'Zoe'];

  for (let i = 0; i < 4; i++) {
    const customer = createCustomerMesh(names[i % names.length], i);
    const orderItems: ProductId[] = [];
    const count = 1 + (i % 3);
    for (let j = 0; j < count; j++) {
      orderItems.push(variantOrder[(i + j) % variantOrder.length]);
    }

    const total = orderItems.reduce((sum, item) => sum + productCatalog[item].price, 0);
    const npc: CustomerNPC = {
      mesh: customer,
      name: names[i % names.length],
      order: { name: names[i % names.length], items: orderItems, price: total, mood: 0.8 },
      target: queueSpots[i].clone(),
      speed: 1.05 + i * 0.08,
      queueIndex: i,
      isAtCheckout: false,
      waitTime: 0,
    };

    npc.mesh.position.copy(queueSpots[i]);
    scene.add(npc.mesh);
    world.customers.push(npc);
  }
}

function createCustomerMesh(name: string, index: number) {
  const group = new THREE.Group();

  const torsoMaterial = new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? '#fb7185' : '#60a5fa', roughness: 0.7 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#f5d0a9', roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.74, 0.32), torsoMaterial);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), headMaterial);
  head.position.y = 1.7;
  head.castShadow = true;
  group.add(head);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), legMaterial);
  leftLeg.position.set(-0.12, 0.32, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.12;
  group.add(rightLeg);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.64, 0.14), torsoMaterial);
  leftArm.position.set(-0.42, 1.0, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.42;
  group.add(rightArm);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: '#f8fafc', transparent: true, opacity: 1 })
  );
  label.scale.set(1.1, 0.4, 1);
  label.position.set(0, 2.3, 0);
  group.add(label);

  group.name = name;
  return group;
}

function interactClosest() {
  const playerPos = camera.position.clone();
  const dist = 2.5;
  let closest: { item: ProductItem; distance: number } | null = null;

  for (const item of productMeshes) {
    if (item.taken) {
      continue;
    }

    const d = playerPos.distanceTo(item.position);
    if (d < dist && (!closest || d < closest.distance)) {
      closest = { item, distance: d };
    }
  }

  if (closest) {
    pickProduct(closest.item);
    return;
  }

  const customerAhead = world.customers.find((customer) =>
    camera.position.distanceTo(customer.mesh.position) < 2.2
  );

  if (customerAhead) {
    scanCheckout(customerAhead);
    return;
  }

  const checkoutDistance = camera.position.distanceTo(world.checkoutPoint);
  if (checkoutDistance < 2.5) {
    scanCheckout();
    return;
  }

  messageNode.textContent = 'Nothing nearby to interact with.';
}

function pickProduct(item: ProductItem) {
  item.taken = true;
  item.mesh.visible = false;
  const nextCount = (player.cart.get(item.id) ?? 0) + 1;
  player.cart.set(item.id, nextCount);
  updateCartHud();
  messageNode.textContent = `${productCatalog[item.id].label} added to cart.`;
}

function scanCheckout(customer?: CustomerNPC) {
  const activeCustomer = customer ?? world.customers[0];
  if (!activeCustomer) {
    messageNode.textContent = 'No customer in line.';
    return;
  }

  if (player.cart.size === 0 && !activeCustomer) {
    messageNode.textContent = 'You need an item to scan.';
    return;
  }

  const matchingOrder = activeCustomer.order;
  let totalMatched = 0;

  const selectedOrder = [...matchingOrder.items];
  const basket = Array.from(player.cart.entries()).flatMap(([id, count]) => Array(count).fill(id));

  for (const itemId of selectedOrder) {
    const index = basket.findIndex((entry) => entry === itemId);
    if (index >= 0) {
      basket.splice(index, 1);
      totalMatched += 1;
    }
  }

  if (totalMatched === 0) {
    messageNode.textContent = `No matching items for ${matchingOrder.name}.`;
    return;
  }

  for (const item of selectedOrder) {
    if (player.cart.has(item)) {
      const value = player.cart.get(item)!;
      player.cart.set(item, Math.max(0, value - 1));
    }
  }

  if (player.cart.size === 0 || Array.from(player.cart.values()).every((count) => count === 0)) {
    player.cart.clear();
  }

  const orderPayment = matchingOrder.price * 0.9;
  world.money += orderPayment;
  world.reputation += 0.15;
  messageNode.textContent = `${matchingOrder.name} paid $${orderPayment.toFixed(2)}.`;

  const idx = world.customers.indexOf(activeCustomer);
  if (idx >= 0) {
    world.customers.splice(idx, 1);
    scene.remove(activeCustomer.mesh);
  }

  if (world.customers.length > 0) {
    const next = world.customers[0];
    if (next) {
      messageNode.textContent = `${next.order.name} is next in line.`;
    }
  }

  updateCartHud();
  updateOrders();
  updateHud();
  saveProgress();
  createCustomers();
}

function upgradeStore() {
  const cost = 140 + world.storeLevel * 60;
  if (world.money < cost) {
    messageNode.textContent = `Need $${cost.toFixed(2)} to expand the shop.`;
    return;
  }

  world.money -= cost;
  world.storeLevel += 1;
  messageNode.textContent = `Store expanded to level ${world.storeLevel}.`;
  updateHud();
  saveProgress();

  for (let i = 0; i < 2; i++) {
    const shelf = buildShelfFallback();
    shelf.position.set(-12 + i * 3, 0, 9 + i * 4);
    shelf.rotation.y = Math.PI * 0.5;
    scene.add(shelf);
  }
}

function nextDay() {
  world.day += 1;
  const bonus = 30 + world.storeLevel * 18;
  world.money += bonus;
  messageNode.textContent = `Day ${world.day} started — bonus $${bonus.toFixed(2)}.`;
  updateHud();
  saveProgress();
  createCustomers();
}

function cycleQuality() {
  const modes: QualityMode[] = ['low', 'medium', 'high'];
  const currentIndex = modes.indexOf(world.quality);
  world.quality = modes[(currentIndex + 1) % modes.length];
  applyQuality(world.quality);
  updateHud();
}

function applyQuality(mode: QualityMode) {
  const low = mode === 'low';
  const medium = mode === 'medium';
  const high = mode === 'high';

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.2 : high ? 2 : 1.6));
  bloom.enabled = !low;
  gtaoPass.enabled = !low;
  smaa.enabled = !low;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = medium ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (low) {
    scene.fog = new THREE.Fog('#dfeaf4', 8, 20);
  } else {
    scene.fog = new THREE.Fog('#dfeaf4', 10, 36);
  }

  qualityButton.textContent = `Quality: ${mode[0].toUpperCase() + mode.slice(1)}`;
  messageNode.textContent = `Quality set to ${mode}.`;
}

function saveProgress() {
  const payload: SaveData = {
    money: world.money,
    day: world.day,
    reputation: world.reputation,
    storeLevel: world.storeLevel,
    purchasedProducts: Array.from(player.cart.keys()),
    lastUpdated: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { money: 180, day: 1, reputation: 1, storeLevel: 1, purchasedProducts: [], lastUpdated: Date.now() };
  }

  try {
    return JSON.parse(raw) as SaveData;
  } catch (error) {
    return { money: 180, day: 1, reputation: 1, storeLevel: 1, purchasedProducts: [], lastUpdated: Date.now() };
  }
}

async function loadRealisticAssets() {
  const manifest = [
    { name: 'shelf', path: '/assets/models/shelf.glb' },
    { name: 'fridge', path: '/assets/models/fridge.glb' },
    { name: 'checkout', path: '/assets/models/checkout.glb' },
    { name: 'cart', path: '/assets/models/cart.glb' },
    { name: 'customer', path: '/assets/models/customer.glb' },
  ];

  for (const spec of manifest) {
    const loader = new GLTFLoader();
    try {
      const asset = await loader.loadAsync(spec.path);
      asset.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      console.info(`[assets] loaded ${spec.name} from ${spec.path}`);
    } catch (error) {
      console.warn(`[assets] missing model: ${spec.name} at ${spec.path}. Add CC0 glTF/GLB files to /public/assets/models/`);
    }
  }
}

function setupTouchControls() {
  const leftStick = document.querySelector('#leftStick') as HTMLDivElement;
  const knob = document.querySelector('#leftKnob') as HTMLDivElement;

  const setStick = (clientX: number, clientY: number) => {
    const rect = leftStick.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const max = rect.width * 0.34;
    const length = Math.min(max, Math.hypot(px, py));
    const angle = Math.atan2(py, px);
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    touchState.joystick.x = x / max;
    touchState.joystick.y = y / max;
    knob.style.transform = `translate(${x}px, ${y}px)`;
  };

  leftStick.addEventListener('pointerdown', (event) => {
    touchState.active = true;
    setStick(event.clientX, event.clientY);
  });

  leftStick.addEventListener('pointermove', (event) => {
    if (!touchState.active) return;
    setStick(event.clientX, event.clientY);
  });

  leftStick.addEventListener('pointerup', () => {
    touchState.active = false;
    touchState.joystick.x = 0;
    touchState.joystick.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  });

  leftStick.addEventListener('pointerleave', () => {
    touchState.active = false;
    touchState.joystick.x = 0;
    touchState.joystick.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.032);
  const moveX =
    (keyState['KeyD'] || keyState['ArrowRight'] ? 1 : 0) -
    (keyState['KeyA'] || keyState['ArrowLeft'] ? 1 : 0) +
    touchState.joystick.x;
  const moveZ =
    (keyState['KeyW'] || keyState['ArrowUp'] ? 1 : 0) -
    (keyState['KeyS'] || keyState['ArrowDown'] ? 1 : 0) -
    touchState.joystick.y;

  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

  player.direction.set(0, 0, 0);
  player.direction.addScaledVector(forward, moveZ);
  player.direction.addScaledVector(right, moveX);

  if (player.direction.lengthSq() > 0) {
    player.direction.normalize();
  }

  const speed = player.moveSpeed * (keyState['ShiftLeft'] ? player.sprintFactor : 1);
  player.velocity.x = player.direction.x * speed;
  player.velocity.z = player.direction.z * speed;

  camera.position.x += player.velocity.x * dt;
  camera.position.z += player.velocity.z * dt;

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -13.5, 13.5);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -13.5, 13.5);
  camera.position.y = player.height;

  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  for (const customer of world.customers) {
    const toTarget = customer.target.clone().sub(customer.mesh.position);
    if (toTarget.lengthSq() > 0.08) {
      toTarget.normalize();
      customer.mesh.position.addScaledVector(toTarget, customer.speed * dt);
      customer.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
    }
  }

  const time = clock.elapsedTime;
  for (const product of productMeshes) {
    if (!product.taken) {
      product.mesh.position.y = product.position.y + Math.sin(time * 2 + product.position.x) * 0.04;
    }
  }

  composer.render(dt);
}
