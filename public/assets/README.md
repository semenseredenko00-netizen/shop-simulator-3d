import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';

type ProductId = 'milk' | 'bread' | 'eggs' | 'juice' | 'chips' | 'cereal';
type QualityMode = 'low' | 'medium' | 'high';

type SaveData = {
  money: number;
  day: number;
  reputation: number;
  storeLevel: number;
  lastUpdated: number;
};

type ProductDef = {
  id: ProductId;
  label: string;
  price: number;
  color: string;
};

type CustomerNpc = {
  mesh: THREE.Group;
  name: string;
  order: ProductId[];
  price: number;
  queueIndex: number;
  target: THREE.Vector3;
  speed: number;
};

type ProductEntry = {
  id: ProductId;
  label: string;
  price: number;
  color: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  collected: boolean;
};

const STORAGE_KEY = 'shop-sim-save-v1';
const productCatalog: Record<ProductId, ProductDef> = {
  milk: { id: 'milk', label: 'Milk', price: 3.2, color: '#dbeafe' },
  bread: { id: 'bread', label: 'Bread', price: 2.8, color: '#f6d5a5' },
  eggs: { id: 'eggs', label: 'Eggs', price: 4.5, color: '#fef3c7' },
  juice: { id: 'juice', label: 'Juice', price: 5.6, color: '#fca5a5' },
  chips: { id: 'chips', label: 'Chips', price: 3.9, color: '#f9a8d4' },
  cereal: { id: 'cereal', label: 'Cereal', price: 6.2, color: '#fdba74' },
};

const PRODUCT_ORDER: ProductId[] = ['milk', 'bread', 'eggs', 'juice', 'chips', 'cereal'];

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

const appState = loadSave();
const playerCart = new Map<ProductId, number>();
const productEntries: ProductEntry[] = [];
const customers: CustomerNpc[] = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfeaf4');
scene.fog = new THREE.Fog('#dfeaf4', 10, 34);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 1.7, 8.6);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
const appRoot = document.getElementById('app') as HTMLDivElement;
appRoot.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.8, 0.08);
composer.addPass(bloom);
const smaa = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
composer.addPass(smaa);
composer.addPass(new OutputPass());

const game = {
  money: appState.money,
  day: appState.day,
  storeLevel: appState.storeLevel,
  reputation: appState.reputation,
  quality: 'medium' as QualityMode,
  customerNames: ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe'],
};

const controls = {
  yaw: 0,
  pitch: 0,
  moveX: 0,
  moveZ: 0,
  velocity: new THREE.Vector3(),
  moveSpeed: 2.7,
  sprintModifier: 1.35,
  pointerLocked: false,
};

const touchState = {
  active: false,
  x: 0,
  y: 0,
};

const keys: Record<string, boolean> = {};

setupLighting();
setupStore();
spawnProducts();
createCustomers();
applyQuality(game.quality);
updateHud();
updateCartUI();
updateOrderUI();
loadRealisticAssets();

renderer.domElement.addEventListener('click', () => {
  if (!controls.pointerLocked) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  controls.pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!controls.pointerLocked) {
    messageNode.textContent = 'Click to resume. Use WASD + mouse.';
  }
});

document.addEventListener('mousemove', (event) => {
  if (!controls.pointerLocked) return;
  controls.yaw -= event.movementX * 0.0022;
  controls.pitch -= event.movementY * 0.0018;
  controls.pitch = THREE.MathUtils.clamp(controls.pitch, -1.25, 1.25);
});

document.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'KeyE') interactClosest();
  if (event.code === 'KeyQ') cycleQuality();
  if (event.code === 'KeyH') expandStore();
  if (event.code === 'KeyN') nextDay();
});

document.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

qualityButton.addEventListener('click', cycleQuality);
upgradeButton.addEventListener('click', expandStore);
dayButton.addEventListener('click', nextDay);
interactButton.addEventListener('click', interactClosest);
scanButton.addEventListener('click', scanCheckout);

setupTouchControls();

renderer.setAnimationLoop(animate);

function setupLighting() {
  const hemi = new THREE.HemisphereLight('#dfeaf4', '#5b6472', 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3cf', 1.7);
  sun.position.set(7, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  scene.add(sun);

  for (const x of [-8, 0, 8]) {
    const light = new THREE.PointLight('#fff4d7', 18, 18, 2);
    light.position.set(x, 3.0, 0);
    light.castShadow = true;
    scene.add(light);
  }
}

function setupStore() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.2, 34),
    new THREE.MeshPhysicalMaterial({
      color: '#d8d9d4',
      roughness: 0.36,
      metalness: 0.12,
      clearcoat: 0.8,
      clearcoatRoughness: 0.25,
    })
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#eef2f7', roughness: 0.96 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(34, 6, 0.3), wallMaterial);
  backWall.position.set(0, 3, -16);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 34), wallMaterial);
  leftWall.position.set(-16, 3, 0);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 34), wallMaterial);
  rightWall.position.set(16, 3, 0);
  scene.add(rightWall);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(34, 0.25, 34), new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.92 }));
  ceiling.position.set(0, 6.05, 0);
  scene.add(ceiling);

  const checkoutBase = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color: '#dbe2ec', metalness: 0.6, roughness: 0.38 })
  );
  checkoutBase.position.set(6.6, 0.7, 4.2);
  checkoutBase.castShadow = true;
  checkoutBase.receiveShadow = true;
  scene.add(checkoutBase);

  const checkoutDisplay = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.75, 0.18),
    new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6, metalness: 0.7 })
  );
  checkoutDisplay.position.set(6.6, 1.55, 5.1);
  scene.add(checkoutDisplay);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.0, 0.12),
    new THREE.MeshStandardMaterial({ color: '#0f172a', emissive: '#1f2937', emissiveIntensity: 0.25 })
  );
  sign.position.set(0, 3.8, -15.82);
  scene.add(sign);

  // Queue line markers
  for (let i = 0; i < 5; i++) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.9),
      new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.75 })
    );
    marker.position.set(-2.6, 0.05, 6.2 - i * 1.5);
    marker.receiveShadow = true;
    scene.add(marker);
  }

  for (let i = 0; i < 3; i++) {
    const shelf = makeShelf();
    shelf.position.set(-10 + i * 5.5, 0, -8 + i * 2.5);
    shelf.rotation.y = Math.PI * 0.5;
    scene.add(shelf);
  }
}

function makeShelf() {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.8, metalness: 0.3 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: '#fafaf9', roughness: 0.75, metalness: 0.2 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.6, 0.66), frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  for (const y of [0.58, -0.08, -0.72]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.66), shelfMat);
    shelf.position.y = y;
    group.add(shelf);
  }

  return group;
}

function spawnProducts() {
  const spawnPositions: Array<[ProductId, THREE.Vector3]> = [
    ['milk', new THREE.Vector3(-10.8, 1.1, -6.0)],
    ['bread', new THREE.Vector3(-9.2, 1.1, -5.8)],
    ['eggs', new THREE.Vector3(-7.6, 1.1, -6.2)],
    ['juice', new THREE.Vector3(-10.8, 1.1, 1.0)],
    ['chips', new THREE.Vector3(-9.2, 1.15, 0.9)],
    ['cereal', new THREE.Vector3(-7.6, 1.2, 1.2)],
  ];

  for (const [id, pos] of spawnPositions) {
    const def = productCatalog[id];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.42, 0.22),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, metalness: 0.18 })
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    productEntries.push({
      id,
      label: def.label,
      price: def.price,
      color: def.color,
      position: pos.clone(),
      mesh,
      collected: false,
    });
  }
}

function createCustomerMesh(name: string, color: string) {
  const group = new THREE.Group();

  const torsoMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#f4d0a8', roughness: 0.95 });
  const legMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.95 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), torsoMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), legMat);
  leftLeg.position.set(-0.12, 0.3, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.12;
  group.add(rightLeg);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), torsoMat);
  leftArm.position.set(-0.42, 1.04, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.42;
  group.add(rightArm);

  const nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#f8fafc', transparent: true }));
  nameTag.scale.set(1.0, 0.32, 1);
  nameTag.position.set(0, 2.4, 0);
  group.add(nameTag);

  group.name = name;
  return group;
}

function createCustomers() {
  const queuePositions = [
    new THREE.Vector3(-2.8, 0, 6),
    new THREE.Vector3(-2.8, 0, 4.4),
    new THREE.Vector3(-2.8, 0, 2.8),
    new THREE.Vector3(-2.8, 0, 1.2),
  ];

  for (let i = 0; i < 4; i++) {
    const color = i % 2 === 0 ? '#fb7185' : '#60a5fa';
    const mesh = createCustomerMesh(game.customerNames[i % game.customerNames.length], color);
    const order = generateOrder(1 + (i % 3));
    const npc: CustomerNpc = {
      mesh,
      name: game.customerNames[i % game.customerNames.length],
      order,
      price: order.reduce((sum, id) => sum + productCatalog[id].price, 0),
      queueIndex: i,
      target: queuePositions[i].clone(),
      speed: 1.05 + i * 0.15,
    };

    npc.mesh.position.copy(queuePositions[i]);
    scene.add(npc.mesh);
    customers.push(npc);
  }

  updateOrderUI();
}

function generateOrder(quantity: number): ProductId[] {
  const order: ProductId[] = [];
  for (let i = 0; i < quantity; i++) {
    const index = Math.floor(Math.random() * PRODUCT_ORDER.length);
    order.push(PRODUCT_ORDER[index]);
  }
  return order;
}

function interactClosest() {
  const playerPos = camera.position;

  for (const entry of productEntries) {
    if (entry.collected) continue;
    if (playerPos.distanceTo(entry.position) < 2.3) {
      collectProduct(entry);
      return;
    }
  }

  const activeCustomer = customers[0];
  if (activeCustomer && playerPos.distanceTo(activeCustomer.mesh.position) < 2.5) {
    scanCheckout();
    return;
  }

  if (playerPos.distanceTo(new THREE.Vector3(6.6, 0.7, 4.2)) < 2.5) {
    scanCheckout();
    return;
  }

  messageNode.textContent = 'Nothing nearby to interact with.';
}

function collectProduct(entry: ProductEntry) {
  entry.collected = true;
  entry.mesh.visible = false;

  const count = playerCart.get(entry.id) ?? 0;
  playerCart.set(entry.id, count + 1);
  updateCartUI();
  messageNode.textContent = `${entry.label} added to cart.`;
}

function updateCartUI() {
  cartListNode.innerHTML = '';
  if (playerCart.size === 0) {
    const li = document.createElement('li');
    li.textContent = 'Empty cart';
    cartListNode.appendChild(li);
    return;
  }

  for (const [id, count] of playerCart.entries()) {
    const def = productCatalog[id];
    const li = document.createElement('li');
    li.innerHTML = `<span>${def.label} x${count}</span><span>$${(def.price * count).toFixed(2)}</span>`;
    cartListNode.appendChild(li);
  }
}

function updateOrderUI() {
  orderListNode.innerHTML = '';
  const first = customers[0];
  if (!first) {
    const li = document.createElement('li');
    li.textContent = 'No active order';
    orderListNode.appendChild(li);
    return;
  }

  for (const id of first.order) {
    const def = productCatalog[id];
    const li = document.createElement('li');
    li.innerHTML = `<span>${def.label}</span><span>$${def.price.toFixed(2)}</span>`;
    orderListNode.appendChild(li);
  }

  const total = document.createElement('li');
  total.innerHTML = `<strong>Total</strong><strong>$${first.price.toFixed(2)}</strong>`;
  orderListNode.appendChild(total);
}

function scanCheckout() {
  const firstCustomer = customers[0];
  if (!firstCustomer) {
    messageNode.textContent = 'No customers currently waiting.';
    return;
  }

  if (playerCart.size === 0) {
    messageNode.textContent = 'Cart is empty — collect groceries first.';
    return;
  }

  const basket = Array.from(playerCart.entries()).flatMap(([id, count]) => Array(count).fill(id));
  const needed = [...firstCustomer.order];
  let matched = 0;

  for (const itemId of needed) {
    const idx = basket.indexOf(itemId);
    if (idx >= 0) {
      basket.splice(idx, 1);
      matched += 1;
    }
  }

  if (matched === 0) {
    messageNode.textContent = `${firstCustomer.name}: this doesn't match!`;
    return;
  }

  const payout = firstCustomer.price * 0.9;
  game.money += payout;
  game.reputation += 0.2;

  playerCart.clear();
  updateCartUI();
  updateHud();

  const soldCustomerIndex = customers.findIndex((npc) => npc.name === firstCustomer.name);
  if (soldCustomerIndex >= 0) {
    const [removed] = customers.splice(soldCustomerIndex, 1);
    scene.remove(removed.mesh);
  }

  messageNode.textContent = `${firstCustomer.name} paid $${payout.toFixed(2)}.`;
  saveProgress();
  if (customers.length > 0) updateOrderUI();
}

function expandStore() {
  const cost = 140 + game.storeLevel * 55;
  if (game.money < cost) {
    messageNode.textContent = `Need $${cost.toFixed(2)} to expand the store.`;
    return;
  }

  game.money -= cost;
  game.storeLevel += 1;
  messageNode.textContent = `Store expanded to level ${game.storeLevel}.`;
  updateHud();
  saveProgress();

  const shelf = makeShelf();
  shelf.position.set(-6.5 + game.storeLevel * 0.4, 0, 9 + game.storeLevel * 0.8);
  shelf.rotation.y = Math.PI * 0.5;
  scene.add(shelf);
}

function nextDay() {
  game.day += 1;
  game.money += 35 + game.storeLevel * 18;
  messageNode.textContent = `Day ${game.day} started — bonus $${(35 + game.storeLevel * 18).toFixed(2)}.`;
  updateHud();
  saveProgress();

  // Add more customers for the new day
  const target = 4 + Math.min(game.day, 3);
  while (customers.length < target) {
    const color = customers.length % 2 === 0 ? '#fb7185' : '#60a5fa';
    const name = game.customerNames[customers.length % game.customerNames.length];
    const mesh = createCustomerMesh(name, color);
    const order = generateOrder(1 + (customers.length % 3));
    const npc: CustomerNpc = {
      mesh,
      name,
      order,
      price: order.reduce((sum, id) => sum + productCatalog[id].price, 0),
      queueIndex: customers.length,
      target: new THREE.Vector3(-2.8, 0, 6 - customers.length * 1.5),
      speed: 1.15 + customers.length * 0.08,
    };
    npc.mesh.position.copy(npc.target);
    scene.add(npc.mesh);
    customers.push(npc);
  }
  updateOrderUI();
}

function cycleQuality() {
  const sequence: QualityMode[] = ['low', 'medium', 'high'];
  const current = sequence.indexOf(game.quality);
  game.quality = sequence[(current + 1) % sequence.length];
  applyQuality(game.quality);
}

function applyQuality(mode: QualityMode) {
  const low = mode === 'low';
  const medium = mode === 'medium';
  const high = mode === 'high';

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.2 : high ? 2 : 1.7));
  gtao.enabled = !low;
  bloom.enabled = !low;
  smaa.enabled = medium || high;
  renderer.shadowMap.enabled = true;

  if (low) scene.fog = new THREE.Fog('#dfeaf4', 8, 22);
  else if (medium) scene.fog = new THREE.Fog('#dfeaf4', 10, 30);
  else scene.fog = new THREE.Fog('#dfeaf4', 12, 36);

  qualityButton.textContent = `Quality: ${mode[0].toUpperCase() + mode.slice(1)}`;
  messageNode.textContent = `Quality set to ${mode}.`;
}

function updateHud() {
  moneyNode.textContent = `$${game.money.toFixed(2)}`;
  dayNode.textContent = `Day ${game.day}`;
  storeNode.textContent = `Store LVL ${game.storeLevel}`;
}

function saveProgress() {
  const data: SaveData = {
    money: game.money,
    day: game.day,
    reputation: game.reputation,
    storeLevel: game.storeLevel,
    lastUpdated: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSave(): SaveData {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { money: 180, day: 1, reputation: 1, storeLevel: 1, lastUpdated: Date.now() };
  }

  try {
    return JSON.parse(stored) as SaveData;
  } catch {
    return { money: 180, day: 1, reputation: 1, storeLevel: 1, lastUpdated: Date.now() };
  }
}

async function loadRealisticAssets() {
  const gltfLoader = new GLTFLoader();
  const candidates = [
    '/assets/models/shelf.glb',
    '/assets/models/fridge.glb',
    '/assets/models/checkout.glb',
    '/assets/models/cart.glb',
    '/assets/models/customer_walk.glb',
  ];

  for (const path of candidates) {
    try {
      const model = await gltfLoader.loadAsync(path);
      model.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(model.scene);
      console.log(`Loaded asset: ${path}`);
    } catch {
      console.warn(`Missing realistic asset: ${path}. Put CC0 GLB files in /public/assets/models/`);
    }
  }
}

function setupTouchControls() {
  const leftStick = document.getElementById('leftStick') as HTMLDivElement;
  const knob = document.getElementById('leftKnob') as HTMLDivElement;

  const setStick = (clientX: number, clientY: number) => {
    const rect = leftStick.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const max = rect.width * 0.34;
    const length = Math.min(max, Math.hypot(px, py));
    const angle = Math.atan2(py, px);
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    touchState.x = x / max;
    touchState.y = y / max;
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
    touchState.x = 0;
    touchState.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  });
  leftStick.addEventListener('pointerleave', () => {
    touchState.active = false;
    touchState.x = 0;
    touchState.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  });
}

function animate() {
  const dt = Math.min(0.033, 0.033);

  const forward = new THREE.Vector3(Math.sin(controls.yaw), 0, Math.cos(controls.yaw)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

  const inputX = Number(keys['KeyD'] || keys['ArrowRight']) - Number(keys['KeyA'] || keys['ArrowLeft']) + touchState.x;
  const inputZ = Number(keys['KeyW'] || keys['ArrowUp']) - Number(keys['KeyS'] || keys['ArrowDown']) - touchState.y;

  const direction = new THREE.Vector3();
  direction.addScaledVector(forward, inputZ);
  direction.addScaledVector(right, inputX);

  if (direction.lengthSq() > 0) direction.normalize();

  const speed = controls.moveSpeed * (keys['ShiftLeft'] ? controls.sprintModifier : 1);
  controls.velocity.x = direction.x * speed;
  controls.velocity.z = direction.z * speed;

  camera.position.x += controls.velocity.x * dt;
  camera.position.z += controls.velocity.z * dt;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -13.5, 13.5);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -13.5, 13.5);
  camera.position.y = 1.7;

  camera.rotation.order = 'YXZ';
  camera.rotation.y = controls.yaw;
  camera.rotation.x = controls.pitch;

  for (const customer of customers) {
    const desired = customer.target.clone().sub(customer.mesh.position);
    if (desired.lengthSq() > 0.08) {
      desired.normalize();
      customer.mesh.position.addScaledVector(desired, customer.speed * dt);
      customer.mesh.rotation.y = Math.atan2(desired.x, desired.z);
    }
  }

  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
