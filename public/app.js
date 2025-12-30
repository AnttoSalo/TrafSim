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
  intersectionReservations: {},
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
}

function loadSampleMap() {
  state.graph.intersections = [];
  state.graph.roads = [];
  state.intersectionReservations = {};

  // Four-way intersection with three active approaches (north, west, south)
  const layout = {
    center: { x: 480, y: 360 },
    north: { x: 480, y: 120 },
    south: { x: 480, y: 620 },
    west: { x: 180, y: 360 },
    east: { x: 780, y: 360 },
  };

  const nodes = Object.fromEntries(Object.entries(layout).map(([key, point]) => [key, createIntersection(point)]));
  state.graph.intersections.push(...Object.values(nodes));

  const connect = (fromKey, toKey) => {
    addRoadBetween(nodes[fromKey], nodes[toKey]);
  };

  ['north', 'south', 'west', 'east'].forEach((arm) => connect(arm, 'center'));
  ['center', 'north', 'south', 'west', 'east'].forEach((arm) => {
    if (arm !== 'center') connect('center', arm);
  });

  state.spawnOrigins = ['north', 'west', 'south'].map((key) => nodes[key].id);
  resetSimulation();
}

function spawnVehicles(count) {
  const { intersections } = state.graph;
  if (intersections.length < 2) return;
  for (let i = 0; i < count; i += 1) {
    const origins = state.spawnOrigins?.map((id) => intersections.find((n) => n.id === id)).filter(Boolean);
    const startPool = origins?.length ? origins : intersections;
    const start = startPool[Math.floor(Math.random() * startPool.length)];
    let end = intersections[Math.floor(Math.random() * intersections.length)];
    let guard = 0;
    while (end.id === start.id && guard < 10) {
      end = intersections[Math.floor(Math.random() * intersections.length)];
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
    reservedIntersection: null,
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

function roadForSegment(fromId, toId) {
  return state.graph.roads.find((r) => r.from === fromId && r.to === toId);
}

function approachDirection(fromId, toId) {
  const from = state.graph.intersections.find((n) => n.id === fromId);
  const to = state.graph.intersections.find((n) => n.id === toId);
  if (!from || !to) return { x: 0, y: 0, angle: 0 };
  const len = distance(from, to) || 1;
  const dir = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  return { ...dir, angle: Math.atan2(dir.y, dir.x) };
}

function normalizeAngle(angle) {
  return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
}

function hasRightSideConflict(vehicle, distanceToIntersection) {
  const intersectionId = vehicle.path[vehicle.segmentIndex + 1];
  const to = state.graph.intersections.find((n) => n.id === intersectionId);
  const from = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex]);
  if (!to || !from) return false;

  const ownApproach = approachDirection(from.id, to.id);
  const arriving = state.vehicles.filter((other) => other.id !== vehicle.id && other.segmentIndex < other.path.length - 1);
  for (const other of arriving) {
    const otherToId = other.path[other.segmentIndex + 1];
    if (otherToId !== intersectionId) continue;
    const otherFromId = other.path[other.segmentIndex];
    const otherApproach = approachDirection(otherFromId, otherToId);

    const rel = normalizeAngle(otherApproach.angle - ownApproach.angle);
    const otherIsOnRight = rel < -0.05; // clockwise direction

    const otherDistance = distance(other.position, to);
    const timeGap = (distanceToIntersection / Math.max(vehicle.speed, 1)) - (otherDistance / Math.max(other.speed, 1));

    if (otherIsOnRight && timeGap > -1.2) {
      return true;
    }
  }
  return false;
}

function leaderOnSegment(vehicle, dir, to) {
  const ahead = state.vehicles.filter((other) => {
    if (other.id === vehicle.id) return false;
    if (other.segmentIndex !== vehicle.segmentIndex) return false;
    const otherTo = state.graph.intersections.find((n) => n.id === other.path[other.segmentIndex + 1]);
    return otherTo?.id === to.id;
  });

  let closest = null;
  ahead.forEach((other) => {
    const delta = {
      x: other.position.x - vehicle.position.x,
      y: other.position.y - vehicle.position.y,
    };
    const projection = delta.x * dir.x + delta.y * dir.y;
    if (projection > 0) {
      const lateral = Math.abs(delta.x * dir.y - delta.y * dir.x);
      if (lateral < 4 && (!closest || projection < closest.projection)) {
        closest = { vehicle: other, projection };
      }
    }
  });
  return closest;
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

  const brakingDistance = (vehicle.speed ** 2) / (2 * vehicle.decel) + 6;
  const approachingIntersection = to.connected.length > 1;
  const mustYield = approachingIntersection && (hasRightSideConflict(vehicle, remaining) || (state.intersectionReservations[to.id] && state.intersectionReservations[to.id] !== vehicle.id));
  const leader = leaderOnSegment(vehicle, dir, to);
  const tooCloseToLeader = leader && leader.projection < Math.max(6, vehicle.speed * vehicle.reactionTime + 4);
  const needToStop = remaining < brakingDistance || mustYield || tooCloseToLeader;

  if (approachingIntersection && !needToStop && !state.intersectionReservations[to.id] && remaining < 10 && vehicle.speed > 1) {
    state.intersectionReservations[to.id] = vehicle.id;
    vehicle.reservedIntersection = to.id;
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

  if (remaining < 4) {
    vehicle.segmentIndex += 1;
    if (vehicle.segmentIndex < vehicle.path.length - 1) {
      const next = state.graph.intersections.find((n) => n.id === vehicle.path[vehicle.segmentIndex + 1]);
      vehicle.heading = angleBetween(vehicle.position, next);
    }
  }

  if (vehicle.reservedIntersection) {
    const reservedNode = state.graph.intersections.find((n) => n.id === vehicle.reservedIntersection);
    if (reservedNode) {
      const clearance = distance(vehicle.position, reservedNode);
      if (clearance > 14) {
        if (state.intersectionReservations[reservedNode.id] === vehicle.id) {
          state.intersectionReservations[reservedNode.id] = null;
        }
        vehicle.reservedIntersection = null;
      }
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
  state.intersectionReservations = {};
  state.spawnOrigins = undefined;
  resetSimulation();
});
ui.sampleMap.addEventListener('click', () => loadSampleMap());

['reaction', 'accel', 'decel', 'speed'].forEach((key) => {
  ui[key].addEventListener('input', updateParameters);
});

loadSampleMap();
updateParameters();
requestAnimationFrame(step);
