* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111827;
  color: #f3f4f6;
  font-family: Inter, "Segoe UI", sans-serif;
}

body {
  touch-action: none;
}

#app {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #dfe9f4 0%, #b9c7d8 100%);
}

#hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#topbar {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 700;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
}

#orderPanel,
#cartPanel {
  position: absolute;
  width: min(240px, 32vw);
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 12px;
  padding: 12px 14px;
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.3);
}

#orderPanel {
  left: 12px;
  bottom: 12px;
}

#cartPanel {
  right: 12px;
  bottom: 12px;
}

#orderPanel h3,
#cartPanel h3 {
  margin: 0 0 8px;
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cbd5e1;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

li {
  font-size: 0.82rem;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #f8fafc;
}

#actions {
  position: absolute;
  right: 12px;
  top: 52px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
}

button {
  pointer-events: auto;
  background: rgba(15, 23, 42, 0.85);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.25);
}

#messageBox {
  position: absolute;
  left: 50%;
  top: 18px;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.72);
  color: #f8fafc;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
  font-size: 0.9rem;
  text-align: center;
  max-width: min(540px, 74vw);
}

#touchControls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 220px;
  pointer-events: none;
  display: none;
}

.stick {
  position: absolute;
  left: 18px;
  bottom: 26px;
  width: 110px;
  height: 110px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.28);
  background: rgba(15, 23, 42, 0.22);
  pointer-events: auto;
  touch-action: none;
}

.knob {
  position: absolute;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

#rightButtons {
  position: absolute;
  right: 18px;
  bottom: 38px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: auto;
}

#rightButtons button {
  width: 82px;
  height: 82px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 1rem;
}

@media (pointer: coarse), (max-width: 900px) {
  #touchControls {
    display: block;
  }

  #orderPanel,
  #cartPanel {
    width: min(180px, 40vw);
    font-size: 0.72rem;
  }

  #messageBox {
    top: 52px;
    font-size: 0.8rem;
  }
}
