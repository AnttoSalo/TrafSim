const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const state = {
  playing: false,
  mode: 'move',
  graph: {
    intersections: [],
    roads: [],
  },
  vehicles: [],
  intersectionState: {},
  spawnEntrances: [],
  params: {
    reaction: 0.6,
    accel: 2.5,
    decel: 4,
    speed: 18,
  },
  lastFrame: performance.now(),
  fps: 0,
};

const ui = {
  playToggle: document.getElementById('playToggle'),
  addIntersection: document.getElementById('addIntersection'),
  addRoad: document.getElementById('addRoad'),
  spawnCars: document.getElementById('spawnCars'),
  resetMap: document.getElementById('resetMap'),
  sampleMap: document.getElementById('sampleMap'),
  vehicleCount: document.getElementById('vehicleCount'),
  status: document.getElementById('status'),
  fps: document.getElementById('fps'),
  reaction: document.getElementById('reaction'),
  accel: document.getElementById('accel'),
  decel: document.getElementById('decel'),
  speed: document.getElementById('speed'),
  reactionValue: document.getElementById('reactionValue'),
  accelValue: document.getElementById('accelValue'),
  decelValue: document.getElementById('decelValue'),
  speedValue: document.getElementById('speedValue'),
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function createIntersection(point) {
  return {
    id: crypto.randomUUID(),
    x: point.x,
    y: point.y,
    connected: [],
    signalPlan: null, // reserved for future traffic lights
  };
}

function createRoad(a, b) {
  const length = distance(a, b);
  return {
    id: crypto.randomUUID(),
    from: a.id,
    to: b.id,
    length,
    lanes: 1,
    width: 10,
  };
}

function addIntersection(point) {
  const intersection = createIntersection(point);
  state.graph.intersections.push(intersection);
  state.intersectionState[intersection.id] = { occupiedBy: null };
  return intersection;
}

function addRoadBetween(a, b) {
  if (a.id === b.id) return;
  const road = createRoad(a, b);
  const reverse = createRoad(b, a);
  state.graph.roads.push(road, reverse);
  a.connected.push(b.id);
  b.connected.push(a.id);
}

function findIntersectionAt(point) {
  return state.graph.intersections.find((i) => distance(i, point) < 12);
}

function resetSimulation() {
  state.vehicles = [];
  Object.values(state.intersectionState).forEach((entry) => {
    entry.occupiedBy = null;
  });
}

function loadSampleMap() {
  state.graph.intersections = [];
  state.graph.roads = [];
  state.intersectionState = {};

  const center = addIntersection({ x: 500, y: 400 });
  const north = addIntersection({ x: 500, y: 150 });
  const west = addIntersection({ x: 200, y: 400 });
  const east = addIntersection({ x: 800, y: 400 });
  const south = addIntersection({ x: 500, y: 650 });

  [north, west, east, south].forEach((node) => {
    addRoadBetween(node, center);
  });

  state.spawnEntrances = [north, west, east];
  resetSimulation();
}

function spawnVehicles(count) {
  const approaches = state.spawnEntrances.length
    ? state.spawnEntrances
    : state.graph.intersections.filter((i) => i.connected.length === 1);
  if (approaches.length < 2) return;
  for (let i = 0; i < count; i += 1) {
    const start = approaches[Math.floor(Math.random() * approaches.length)];
    let end = approaches[Math.floor(Math.random() * approaches.length)];
    let guard = 0;
    while (end.id === start.id && guard < 10) {
      end = approaches[Math.floor(Math.random() * approaches.length)];
      guard += 1;
    }
    const path = findPath(start.id, end.id);
    if (!path) continue;
    state.vehicles.push(createVehicle(path));
  }
}

function heuristic(a, b) {
  return distance(a, b);
}

function findPath(startId, goalId) {
  const nodes = state.graph.intersections.reduce((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});

  const open = new Set([startId]);
  const cameFrom = {};
  const gScore = { [startId]: 0 };
  const fScore = { [startId]: heuristic(nodes[startId], nodes[goalId]) };

  while (open.size) {
    let current = null;
    open.forEach((id) => {
      if (current === null || (fScore[id] ?? Infinity) < (fScore[current] ?? Infinity)) {
        current = id;
      }
    });

    if (current === goalId) {
      const path = [];
      while (current) {
        path.unshift(current);
        current = cameFrom[current];
      }
      return path;
    }

    open.delete(current);
    const currentNode = nodes[current];
    currentNode.connected.forEach((neighborId) => {
      const tentativeG = (gScore[current] ?? Infinity) + distance(currentNode, nodes[neighborId]);
      if (tentativeG < (gScore[neighborId] ?? Infinity)) {
        cameFrom[neighborId] = current;
        gScore[neighborId] = tentativeG;
        fScore[neighborId] = tentativeG + heuristic(nodes[neighborId], nodes[goalId]);
        open.add(neighborId);
      }
    });
  }
  return null;
}

function createVehicle(path) {
  const [start, next] = path;
  const startNode = state.graph.intersections.find((n) => n.id === start);
  const nextNode = state.graph.intersections.find((n) => n.id === next);
  const heading = angleBetween(startNode, nextNode);
  return {
    id: crypto.randomUUID(),
    path,
    segmentIndex: 0,
    position: { x: startNode.x, y: startNode.y },
    heading,
    speed: 0,
    targetSpeed: state.params.speed,
    reactionTime: state.params.reaction,
    accel: state.params.accel,
    decel: state.params.decel,
    reactionTimer: 0,
    inIntersection: null,
    lastIntersectionPosition: null,
  };
}

function updateParameters() {
  state.params.reaction = parseFloat(ui.reaction.value);
  state.params.accel = parseFloat(ui.accel.value);
  state.params.decel = parseFloat(ui.decel.value);
  state.params.speed = parseFloat(ui.speed.value);
  ui.reactionValue.textContent = `${state.params.reaction.toFixed(1)} s`;
  ui.accelValue.textContent = `${state.params.accel.toFixed(1)} m/s²`;
  ui.decelValue.textContent = `${state.params.decel.toFixed(1)} m/s²`;
  ui.speedValue.textContent = `${state.params.speed.toFixed(0)} m/s`;
  state.vehicles.forEach((v) => {
    v.reactionTime = state.params.reaction;
    v.accel = state.params.accel;
    v.decel = state.params.decel;
    v.targetSpeed = state.params.speed;
  });
}

function releaseIntersection(vehicle) {
  if (!vehicle.inIntersection) return;
  const stateEntry = state.intersectionState[vehicle.inIntersection];
  if (stateEntry && stateEntry.occupiedBy === vehicle.id) {
    stateEntry.occupiedBy = null;
  }
  vehicle.inIntersection = null;
  vehicle.lastIntersectionPosition = null;
}

function roadForSegment(fromId, toId) {
  return state.graph.roads.find((r) => r.from === fromId && r.to === toId);
}

function incomingDirection(from, to) {
  const len = distance(from, to) || 1;
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

function isOtherOnRight(myDir, otherDir) {
  const right = { x: myDir.y, y: -myDir.x }; // rotate clockwise
  const tolerance = Math.cos(Math.PI / 4);
  const dot = right.x * otherDir.x + right.y * otherDir.y;
  return dot > tolerance;
}

function intersectionHasConflict(vehicle, distanceToIntersection) {
  const intersectionId = vehicle.path[vehicle.segmentIndex + 1];
  const intersection = state.graph.intersections.find((n) => n.id === intersectionId);
  if (!intersection) return false;

  const occupancy = state.intersectionState[intersectionId];
  if (occupancy?.occupiedBy && occupancy.occupiedBy !== vehicle.id) return true;

  const fromNode = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex]);
  const myDir = incomingDirection(fromNode, intersection);

  const approaching = state.vehicles.filter(
    (other) => other.id !== vehicle.id && other.segmentIndex < other.path.length - 1
  );

  for (const other of approaching) {
    const nextIntersection = other.path[other.segmentIndex + 1];
    if (nextIntersection !== intersectionId) continue;

    const otherFrom = state.graph.intersections.find((n) => n.id === other.path[other.segmentIndex]);
    const otherDir = incomingDirection(otherFrom, intersection);
    const otherDistance = distance(other.position, intersection);

    if (other.inIntersection === intersectionId) return true;
    const yieldToRight = isOtherOnRight(myDir, otherDir);
    const rightHasPriority = yieldToRight && otherDistance < distanceToIntersection + 8;
    if (rightHasPriority) return true;
  }

  return false;
}

function updateVehicle(vehicle, dt) {
  if (vehicle.segmentIndex >= vehicle.path.length - 1) return;
  const from = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex]);
  const to = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex + 1]);
  const road = roadForSegment(from.id, to.id);
  const segLength = road?.length ?? distance(from, to);
  const dir = { x: (to.x - from.x) / segLength, y: (to.y - from.y) / segLength };

  const remaining = distance(vehicle.position, to);
  const desiredHeading = Math.atan2(dir.y, dir.x);
  vehicle.heading = lerpAngle(vehicle.heading, desiredHeading, 0.15);

  const brakingDistance = (vehicle.speed ** 2) / (2 * vehicle.decel) + 4;
  const mustYield = intersectionHasConflict(vehicle, remaining);
  const needToStop = remaining < brakingDistance || mustYield;
  const enteringIntersection = remaining < 14 && !vehicle.inIntersection;

  if (enteringIntersection && !mustYield) {
    const slot = state.intersectionState[to.id];
    if (!slot.occupiedBy) {
      slot.occupiedBy = vehicle.id;
      vehicle.inIntersection = to.id;
      vehicle.lastIntersectionPosition = { x: to.x, y: to.y };
    }
  }

  if (needToStop) {
    vehicle.reactionTimer += dt;
    if (vehicle.reactionTimer >= vehicle.reactionTime) {
      vehicle.speed = Math.max(0, vehicle.speed - vehicle.decel * dt);
    }
  } else {
    vehicle.reactionTimer = 0;
    if (vehicle.speed < vehicle.targetSpeed) {
      vehicle.speed = Math.min(vehicle.targetSpeed, vehicle.speed + vehicle.accel * dt);
    }
  }

  const step = vehicle.speed * dt;
  vehicle.position.x += dir.x * step;
  vehicle.position.y += dir.y * step;

  if (vehicle.inIntersection && vehicle.lastIntersectionPosition) {
    const travelledFromCenter = distance(vehicle.position, vehicle.lastIntersectionPosition);
    if (travelledFromCenter > 22) {
      releaseIntersection(vehicle);
    }
  }

  if (remaining < 4) {
    vehicle.segmentIndex += 1;
    if (vehicle.segmentIndex < vehicle.path.length - 1) {
      const next = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex + 1]);
      vehicle.heading = angleBetween(vehicle.position, next);
    }
  }
}

function lerpAngle(a, b, t) {
  const delta = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

function update(dt) {
  if (!state.playing) return;
  state.vehicles.forEach((v) => updateVehicle(v, dt));
  state.vehicles.forEach((v) => {
    if (v.segmentIndex >= v.path.length - 1) {
      releaseIntersection(v);
    }
  });
  state.vehicles = state.vehicles.filter((v) => v.segmentIndex < v.path.length - 1);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b1221';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  state.graph.roads.forEach((road) => {
    const from = state.graph.intersections.find((n) => n.id === road.from);
    const to = state.graph.intersections.find((n) => n.id === road.to);
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([16, 16]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  state.graph.intersections.forEach((i) => {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(i.x, i.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  state.vehicles.forEach((v) => {
    ctx.save();
    ctx.translate(v.position.x, v.position.y);
    ctx.rotate(v.heading);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  });
}

let dragging = false;
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const hit = findIntersectionAt(point);
  if (state.mode === 'intersection') {
    if (!hit) addIntersection(point);
  } else if (state.mode === 'road') {
    canvas.dataset.selected = canvas.dataset.selected || '';
    if (!canvas.dataset.selected && hit) {
      canvas.dataset.selected = hit.id;
    } else if (canvas.dataset.selected && hit) {
      const from = state.graph.intersections.find((i) => i.id === canvas.dataset.selected);
      addRoadBetween(from, hit);
      canvas.dataset.selected = '';
    }
  } else {
    if (hit) {
      dragging = hit;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  dragging.x = e.clientX - rect.left;
  dragging.y = e.clientY - rect.top;
});

canvas.addEventListener('mouseup', () => {
  dragging = false;
});

function step() {
  const now = performance.now();
  const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
  state.lastFrame = now;
  update(dt);
  draw();
  state.fps = Math.round(1 / dt);
  ui.vehicleCount.textContent = state.vehicles.length;
  ui.status.textContent = state.playing ? 'Käynnissä' : 'Pysäytetty';
  ui.fps.textContent = state.fps;
  requestAnimationFrame(step);
}

ui.playToggle.addEventListener('click', () => {
  state.playing = !state.playing;
  ui.playToggle.textContent = state.playing ? '⏸' : '▶';
});

ui.addIntersection.addEventListener('click', () => {
  state.mode = 'intersection';
});

ui.addRoad.addEventListener('click', () => {
  state.mode = 'road';
  canvas.dataset.selected = '';
});

ui.spawnCars.addEventListener('click', () => spawnVehicles(500));
ui.resetMap.addEventListener('click', () => {
  state.graph.intersections = [];
  state.graph.roads = [];
  state.intersectionState = {};
  state.spawnEntrances = [];
  resetSimulation();
});
ui.sampleMap.addEventListener('click', () => loadSampleMap());

['reaction', 'accel', 'decel', 'speed'].forEach((key) => {
  ui[key].addEventListener('input', updateParameters);
});

loadSampleMap();
updateParameters();
requestAnimationFrame(step);
