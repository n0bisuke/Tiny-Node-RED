const API_ROOT = '/ui/api/';
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const TEXT_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
};

const NODE_LIST = [
  {
    id: 'node-red/inject',
    module: 'node-red',
    name: 'inject',
    types: ['inject'],
    enabled: true,
    moduleLocal: true,
    local: true,
    version: '3.1.0',
  },
  {
    id: 'node-red/debug',
    module: 'node-red',
    name: 'debug',
    types: ['debug'],
    enabled: true,
    moduleLocal: true,
    local: true,
    version: '3.1.0',
  },
];

const THEME_CONTEXT = {
  page: {
    title: 'Edge Node-RED',
    favicon: 'vendor/editor-client/favicon.ico',
    tabicon: {
      icon: 'vendor/editor-client/red/images/node-red-icon-black.svg',
      colour: '#ff2f00',
    },
    css: ['edge-theme.css'],
    scripts: [],
  },
  header: {
    title: 'Edge Node-RED Subset',
    image: 'vendor/editor-client/red/images/node-red.svg',
  },
  asset: {
    red: 'vendor/editor-client/red/red.min.js',
    main: 'edge-boot.js',
    vendorMonaco: '',
  },
  themes: [],
};

const EDITOR_SETTINGS = {
  httpNodeRoot: '/api',
  version: 'edge-0.1.0',
  user: {
    anonymous: false,
    username: 'edge',
    permissions: '*',
  },
  editorTheme: {
    tours: false,
    projects: {
      enabled: false,
    },
    multiplayer: {
      enabled: false,
    },
    palette: {
      editable: false,
      upload: false,
    },
    menu: {
      'menu-item-projects': false,
      'menu-item-keyboard-shortcuts': true,
      'menu-item-import-library': false,
      'menu-item-export-library': false,
    },
    page: {
      title: 'Edge Node-RED',
      favicon: 'vendor/editor-client/favicon.ico',
    },
    header: {
      title: 'Edge Node-RED',
    },
    deployButton: {
      type: 'simple',
      label: 'Deploy',
    },
    markdownEditor: {
      mermaid: {
        enabled: false,
      },
    },
    mermaid: {
      enabled: false,
    },
  },
  context: [],
  paletteCategories: ['input', 'output', 'function', 'advanced'],
  externalModules: {
    palette: {
      allowInstall: false,
      allowUpload: false,
    },
  },
  diagnostics: {
    enabled: false,
    ui: false,
  },
  runtimeState: {
    enabled: false,
    ui: false,
  },
  telemetryEnabled: false,
  flowEncryptionType: 'disabled',
  libraries: [],
  codeEditor: {
    lib: 'ace',
    options: {},
  },
};

const DEFAULT_FLOW = [
  {
    id: 'flow-home',
    type: 'tab',
    label: 'Edge Demo',
    disabled: false,
    info: '',
  },
  {
    id: 'inject-welcome',
    type: 'inject',
    z: 'flow-home',
    name: 'Hello payload',
    props: [
      { p: 'payload', v: 'Edge Node-RED', vt: 'str' },
      { p: 'topic', v: '', vt: 'str' },
    ],
    repeat: '',
    crontab: '',
    once: false,
    onceDelay: 0.1,
    topic: '',
    payload: '',
    payloadType: 'date',
    x: 150,
    y: 120,
    wires: [['debug-panel']],
  },
  {
    id: 'debug-panel',
    type: 'debug',
    z: 'flow-home',
    name: 'Debug panel',
    active: true,
    tosidebar: true,
    console: false,
    tostatus: false,
    complete: 'payload',
    targetType: 'msg',
    statusVal: '',
    statusType: 'auto',
    x: 360,
    y: 120,
    wires: [[]],
  },
];

let flowState = {
  flows: DEFAULT_FLOW,
  credentials: {},
  rev: createRevision(),
};
let nodeIndex = new Map();
let wireIndex = new Map();
let tabIndex = new Map();

let userSettings = {};
const connectedClients = new Set();
const localeCache = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(API_ROOT)) {
    event.respondWith(handleApiRequest(request, url));
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  const clientId = event.source && event.source.id;
  if (!data || typeof data !== 'object') return;
  switch (data.type) {
    case 'comms-connect':
      if (clientId) {
        connectedClients.add(clientId);
        sendInitialRuntimeState(clientId);
      }
      break;
    case 'comms-disconnect':
      if (clientId) connectedClients.delete(clientId);
      break;
    case 'comms-send':
      handleCommsSend(clientId, data);
      break;
    default:
      break;
  }
});

function jsonResponse(body, status = 200, headers = JSON_HEADERS) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: TEXT_HEADERS,
  });
}

function notFound(message = 'Not Found') {
  return textResponse(message, 404);
}

function methodNotAllowed() {
  return textResponse('Method Not Allowed', 405);
}

function createRevision() {
  return Date.now().toString(16);
}

function rebuildFlowIndex() {
  nodeIndex = new Map();
  wireIndex = new Map();
  tabIndex = new Map();

  for (const node of flowState.flows) {
    if (node.type === 'tab') {
      tabIndex.set(node.id, node);
    }
  }
  for (const node of flowState.flows) {
    nodeIndex.set(node.id, node);
    if (node.wires && Array.isArray(node.wires)) {
      wireIndex.set(node.id, node.wires.flat().filter(Boolean));
    } else {
      wireIndex.set(node.id, []);
    }
    if (node.z && tabIndex.has(node.z)) {
      const tab = tabIndex.get(node.z);
      node.__path = tab?.label || '';
    }
  }
}

rebuildFlowIndex();

function applyFlowDeployment(payload, options = {}) {
  if (!payload || !Array.isArray(payload.flows)) {
    return { ok: false };
  }
  flowState = {
    flows: payload.flows,
    credentials: payload.credentials || {},
    rev: createRevision(),
  };
  rebuildFlowIndex();
  const info = { revision: flowState.rev };
  if (options.broadcast !== false) {
    broadcastComms('notification/runtime-deploy', info);
    broadcastComms('notification/runtime-state', { state: 'start', deploy: true });
    broadcastComms('status/runtime', { text: 'edge-runtime', fill: 'green', shape: 'dot' });
  }
  return { ok: true, info };
}

async function handleApiRequest(request, url) {
  const path = url.pathname.slice(API_ROOT.length);
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization,Node-RED-API-Version',
      },
    });
  }

  if (path === 'theme' && request.method === 'GET') {
    return jsonResponse(THEME_CONTEXT);
  }

  if (path === 'settings' && request.method === 'GET') {
    return jsonResponse(EDITOR_SETTINGS);
  }

  if (path === 'settings/user') {
  if (path === 'auth/login') {
    if (request.method === 'POST') {
      return jsonResponse({ ok: true, user: EDITOR_SETTINGS.user });
    }
    return methodNotAllowed();
  }

  if (path === 'auth/logout' && request.method === 'POST') {
    return jsonResponse({ ok: true });
  }

  if (path === 'auth/token' && request.method === 'POST') {
    return jsonResponse({ ok: true, access_token: '', expires_in: 0 });
  }

    if (request.method === 'GET') {
      return jsonResponse(userSettings || {});
    }
    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        userSettings = payload || {};
        return jsonResponse({ ok: true });
      } catch (error) {
        return textResponse('Invalid JSON', 400);
      }
    }
    return methodNotAllowed();
  }

  if (path === 'red/keymap.json' && request.method === 'GET') {
    return fetch('./vendor/editor-client/red/keymap.json');
  }

  if (path.startsWith('debug/view/')) {
    if (request.method === 'GET') {
      const asset = path.substring('debug/view/'.length);
      return fetch(`./debug/view/${asset}`);
    }
    return methodNotAllowed();
  }

  if (path.startsWith('red/images/')) {
    const asset = path.substring('red/images/'.length);
    return fetch(`./vendor/editor-client/red/images/${asset}`);
  }

  if (path.startsWith('icons/node-red/')) {
    const asset = path.substring('icons/node-red/'.length);
    return fetch(`./vendor/editor-client/red/images/icons/${asset}`);
  }

  if (path.startsWith('vendor/mermaid/')) {
    return new Response('window.mermaid=undefined;', {
      status: 200,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    });
  }

  if (path === 'plugins') {
    const accept = request.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return jsonResponse([]);
    }
    return textResponse('<!-- no plugins -->');
  }

  if (path === 'plugins/messages') {
    return jsonResponse({});
  }

  if (path === 'icons') {
    return jsonResponse({});
  }

  if (path === 'nodes') {
    const accept = request.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return jsonResponse(NODE_LIST);
    }
    return fetchNodeHtml();
  }

  if (path.startsWith('nodes/messages')) {
    const lang = normalizeLanguage(url.searchParams.get('lng'));
    const data = await loadLocaleBundle('node-red', lang);
    return jsonResponse({ 'node-red': data });
  }

  if (path.startsWith('nodes/')) {
    const [, namespace, resource] = path.split('/');
    if (resource === 'messages') {
      const lang = normalizeLanguage(url.searchParams.get('lng'));
      const data = await loadLocaleBundle(namespace, lang);
      return jsonResponse(data);
    }
  }

  if (path.startsWith('locales/')) {
    const [, namespace] = path.split('/');
    const lang = normalizeLanguage(url.searchParams.get('lng'));
    const data = await loadLocaleBundle(namespace, lang);
    return jsonResponse(data || {});
  }

  if (path === 'flows') {
    if (request.method === 'GET') {
      return jsonResponse({ flows: flowState.flows, rev: flowState.rev });
    }
    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        const result = applyFlowDeployment(payload);
        if (!result.ok) {
          return textResponse('Invalid flow payload', 400);
        }
        return jsonResponse({ rev: result.info.revision });
      } catch (error) {
        return textResponse('Invalid JSON', 400);
      }
    }
    return methodNotAllowed();
  }

  if (path === 'deploy') {
    if (request.method === 'GET') {
      return jsonResponse({ rev: flowState.rev });
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      let payload = null;
      if (request.headers.get('content-type')?.includes('application/json')) {
        try {
          const raw = await request.text();
          payload = raw ? JSON.parse(raw) : null;
        } catch (error) {
          return textResponse('Invalid JSON', 400);
        }
      }
      if (payload && Array.isArray(payload.flows)) {
        const result = applyFlowDeployment(payload);
        if (!result.ok) {
          return textResponse('Invalid flow payload', 400);
        }
        return jsonResponse({ ok: true, rev: result.info.revision });
      }
      broadcastComms('notification/runtime-deploy', { revision: flowState.rev });
      return jsonResponse({ ok: true, rev: flowState.rev });
    }
    return methodNotAllowed();
  }

  if (path.startsWith('inject/')) {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }
    const nodeId = decodeURIComponent(path.slice('inject/'.length));
    try {
      const customMsg = request.headers.get('content-type')?.includes('application/json')
        ? await request.json()
        : {};
      const result = triggerInject(nodeId, customMsg);
      if (!result.ok) {
        return textResponse(result.error || 'Inject failed', 404);
      }
      return jsonResponse({ ok: true });
    } catch (error) {
      return textResponse('inject error', 500);
    }
  }

  if (path.startsWith('debug/')) {
    if (request.method !== 'POST') {
      return methodNotAllowed();
    }
    const segments = path.split('/').slice(1); // remove 'debug'
    if (segments.length === 1) {
      const state = segments[0];
      return handleDebugBatchToggle(state, request);
    }
    if (segments.length === 2) {
      const [id, state] = segments;
      return handleDebugToggle(id, state);
    }
    return notFound();
  }

  return notFound();
}

async function fetchNodeHtml() {
  return fetch('./nodes/inject-debug.html');
}

function normalizeLanguage(value) {
  if (!value) return 'en-us';
  return value.toLowerCase();
}

async function loadLocaleBundle(namespace, lang) {
  const normalisedLang = lang === 'en-us' ? 'en-US' : lang;
  const key = `${normalisedLang}/${namespace}`;
  if (localeCache.has(key)) {
    return localeCache.get(key);
  }
  try {
    const response = await fetch(`./locales/${normalisedLang}/${namespace}.json`);
    if (!response.ok) {
      if (normalisedLang !== 'en-US') {
        return loadLocaleBundle(namespace, 'en-us');
      }
      return {};
    }
    const data = await response.json();
    localeCache.set(key, data);
    return data;
  } catch (error) {
    if (normalisedLang !== 'en-US') {
      return loadLocaleBundle(namespace, 'en-us');
    }
    return {};
  }
}

function triggerInject(nodeId, customMsg) {
  const node = nodeIndex.get(nodeId);
  if (!node) {
    return { ok: false, error: 'inject_not_found' };
  }
  const baseMessage = buildMessageFromInject(node, customMsg);
  runWires(nodeId, baseMessage);
  return { ok: true };
}

function buildMessageFromInject(node, customMsg = {}) {
  const msg = {
    _msgid: createRevision(),
    topic: '',
    payload: undefined,
  };

  if (Array.isArray(node.props)) {
    for (const prop of node.props) {
      const target = prop.p || 'payload';
      const type = prop.vt || 'str';
      const value = prop.v;
      msg[target] = evaluateInjectValue(value, type, msg);
    }
  } else {
    msg.payload = evaluateInjectValue(node.payload, node.payloadType || 'date', msg);
    msg.topic = node.topic || '';
  }

  Object.assign(msg, customMsg || {});
  return msg;
}

function evaluateInjectValue(value, type, msg) {
  switch (type) {
    case 'str':
      return value != null ? String(value) : '';
    case 'num':
      return Number(value);
    case 'bool':
      return value === true || value === 'true';
    case 'json':
      try {
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return null;
      }
    case 'date':
      return Date.now();
    case 'env':
      return typeof value === 'string' ? value : '';
    default:
      return value;
  }
}

function runWires(nodeId, msg) {
  const targets = wireIndex.get(nodeId) || [];
  for (const targetId of targets) {
    const nextNode = nodeIndex.get(targetId);
    if (!nextNode) continue;
    const cloned = cloneMessage(msg);
    executeNode(nextNode, cloned);
  }
}

function executeNode(node, msg) {
  switch (node.type) {
    case 'debug':
      performDebug(node, msg);
      break;
    default:
      break;
  }
  const targets = wireIndex.get(node.id) || [];
  for (const targetId of targets) {
    const nextNode = nodeIndex.get(targetId);
    if (!nextNode) continue;
    const cloned = cloneMessage(msg);
    executeNode(nextNode, cloned);
  }
}

function performDebug(node, msg) {
  if (node.tosidebar === false) {
    return;
  }
  if (node.active === false) {
    return;
  }

  const complete = node.complete || 'payload';
  const targetType = node.targetType || 'msg';
  let property = 'payload';
  let value;

  if (complete === 'true' || targetType === 'full') {
    property = 'msg';
    value = msg;
  } else {
    property = complete || 'payload';
    value = getMessageProperty(msg, property);
  }

  const valueClone = cloneForTransfer(value);
  const label = node.name || node.id;
  const payload = {
    id: node.id,
    z: node.z,
    _alias: node._alias || label,
    path: node.__path || '',
    name: node.name || '',
    type: node.type || 'debug',
    label,
    topic: msg.topic || '',
    property,
    msg: valueClone,
    format: inferDebugFormat(valueClone),
    level: 'log',
  };

  broadcastComms('debug', payload);
}

function getMessageProperty(obj, path) {
  if (!path || path === 'msg') {
    return obj;
  }
  const parts = path.split('.');
  let target = obj;
  for (const part of parts) {
    if (target == null) return undefined;
    target = target[part];
  }
  return target;
}

function cloneMessage(msg) {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(msg);
    }
  } catch (error) {
    // ignore
  }
  try {
    return JSON.parse(JSON.stringify(msg));
  } catch (error) {
    return msg;
  }
}

function inferDebugFormat(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'object';
  switch (typeof value) {
    case 'string':
      return 'text';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

function cloneForTransfer(value) {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch (error) {
    // ignore
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function sendCommsToClient(clientId, topic, data) {
  if (!clientId) return;
  self.clients.get(clientId).then((client) => {
    if (client) {
      client.postMessage({ type: 'comms-message', topic, data });
    }
  }).catch(() => {});
}

function sendInitialRuntimeState(clientId) {
  sendCommsToClient(clientId, 'notification/runtime-state', { state: 'start' });
  sendCommsToClient(clientId, 'status/runtime', { text: 'edge-runtime', fill: 'green', shape: 'dot' });
  sendCommsToClient(clientId, 'notification/runtime-deploy', { revision: flowState.rev });
}

function broadcastComms(topic, data) {
  self.clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clientList) => {
      for (const client of clientList) {
        if (connectedClients.size === 0 || connectedClients.has(client.id)) {
          client.postMessage({ type: 'comms-message', topic, data });
        }
      }
    })
    .catch(() => {});
}

function handleCommsSend(_clientId, message) {
  // Placeholder for future features (e.g., status updates)
  if (message?.topic && message?.data) {
    // Echo back runtime-state queries for basic UX
    if (message.topic === 'status/runtime') {
      broadcastComms('status/runtime', { text: 'edge-runtime', fill: 'green', shape: 'dot' });
    }
  }
}

async function handleDebugToggle(id, state) {
  const node = nodeIndex.get(id);
  if (!node || node.type !== 'debug') {
    return textResponse('Not found', 404);
  }
  if (state !== 'enable' && state !== 'disable') {
    return textResponse('Invalid state', 400);
  }
  node.active = state === 'enable';
  return textResponse('OK', state === 'enable' ? 200 : 201);
}

async function handleDebugBatchToggle(state, request) {
  if (state !== 'enable' && state !== 'disable') {
    return textResponse('Invalid state', 400);
  }
  try {
    const body = await request.json();
    if (!Array.isArray(body?.nodes)) {
      return textResponse('Invalid payload', 400);
    }
    body.nodes.forEach((id) => {
      const node = nodeIndex.get(id);
      if (node && node.type === 'debug') {
        node.active = state === 'enable';
      }
    });
    return textResponse('OK', state === 'enable' ? 200 : 201);
  } catch (error) {
    return textResponse('Invalid payload', 400);
  }
}
