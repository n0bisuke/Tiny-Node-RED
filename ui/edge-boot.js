const API_ROOT = '/ui/api/';

let swController = navigator.serviceWorker?.controller ?? null;
const pendingSwMessages = [];

function flushControllerQueue() {
  if (!swController) return;
  while (pendingSwMessages.length) {
    swController.postMessage(pendingSwMessages.shift());
  }
}

function postToServiceWorker(message) {
  if (!navigator.serviceWorker) {
    return;
  }
  if (swController) {
    swController.postMessage(message);
  } else {
    pendingSwMessages.push(message);
  }
}

function trackServiceWorkerController() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    swController = navigator.serviceWorker.controller;
    flushControllerQueue();
  });
  navigator.serviceWorker.ready
    .then((registration) => {
      swController = registration.active;
      flushControllerQueue();
    })
    .catch(() => {
      /* noop */
    });
}

function createTopicMatcher(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return () => true;
  }
  try {
    const escaped = pattern
      .replace(/([\[\]\?\(\)\\\/\$\^\*\.|])/g, '\\$1')
      .replace(/\+/g, '[^/]+');
    if (escaped.endsWith('/#')) {
      const base = escaped.slice(0, -2);
      const regex = new RegExp(`^${base}(?:/(.*))?$`);
      return (topic) => regex.test(topic);
    }
    const regex = new RegExp(`^${escaped}$`);
    return (topic) => regex.test(topic);
  } catch (error) {
    console.warn('Failed to create topic matcher', pattern, error);
    return (topic) => topic === pattern;
  }
}

function setupCommsBridge() {
  if (typeof RED !== 'object') {
    return;
  }

  const subscriptionMap = new Map();
  const eventHandlers = new Map();
  let isConnected = false;

  function emit(event, ...args) {
    const handlers = eventHandlers.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.warn(`RED.comms handler for ${event} failed`, error);
      }
    });
  }

  function deliver(topic, payload) {
    subscriptionMap.forEach((entry) => {
      if (entry.matcher(topic)) {
        entry.handlers.forEach((handler) => {
          try {
            handler(topic, payload);
          } catch (error) {
            console.warn('RED.comms subscriber error', topic, payload, error);
          }
        });
      }
    });
  }

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'comms-message') {
        deliver(message.topic, message.data);
      } else if (message.type === 'comms-event') {
        emit(message.event, message.payload);
      }
    });
  }

  function subscribe(pattern, handler) {
    if (!subscriptionMap.has(pattern)) {
      subscriptionMap.set(pattern, {
        matcher: createTopicMatcher(pattern),
        handlers: [],
      });
    }
    subscriptionMap.get(pattern).handlers.push(handler);
  }

  function unsubscribe(pattern, handler) {
    const entry = subscriptionMap.get(pattern);
    if (!entry) return;
    entry.handlers = entry.handlers.filter((fn) => fn !== handler);
    if (entry.handlers.length === 0) {
      subscriptionMap.delete(pattern);
    }
  }

  function on(event, handler) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event).add(handler);
  }

  function off(event, handler) {
    const handlers = eventHandlers.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      eventHandlers.delete(event);
    }
  }

  const comms = {
    connect() {
      if (isConnected) return;
      isConnected = true;
      postToServiceWorker({ type: 'comms-connect' });
      emit('connect');
    },
    disconnect() {
      if (!isConnected) return;
      isConnected = false;
      postToServiceWorker({ type: 'comms-disconnect' });
      emit('disconnect');
    },
    subscribe,
    unsubscribe,
    on,
    off,
    send(topic, data) {
      postToServiceWorker({ type: 'comms-send', topic, data });
    },
  };

  RED.comms = comms;
}

function patchRedRuntime() {
  if (typeof RED !== 'object') {
    return;
  }

  if (RED.telemetry) {
    RED.telemetry.init = noop;
  }

  if (RED.diagnostics && typeof RED.diagnostics.init === 'function') {
    const diagnosticsInit = RED.diagnostics.init;
    RED.diagnostics.init = function (...args) {
      try {
        return diagnosticsInit.apply(this, args);
      } catch (error) {
        console.warn('RED.diagnostics.init disabled', error);
        return undefined;
      }
    };
  }

  if (RED.runtime && typeof RED.runtime.init === 'function') {
    const runtimeInit = RED.runtime.init;
    RED.runtime.init = function (...args) {
      try {
        return runtimeInit.apply(this, args);
      } catch (error) {
        console.warn('RED.runtime.init encountered an error', error);
        return undefined;
      }
    };
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported in this browser');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
      type: 'module',
    });
    await navigator.serviceWorker.ready;
    swController = navigator.serviceWorker.controller ?? registration.active;
    flushControllerQueue();
    return registration;
  } catch (error) {
    console.error('Failed to register service worker', error);
    throw error;
  }
}

function setDocumentTitle() {
  if (window.location.hostname && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    document.title = `${document.title} : ${window.location.hostname}`;
  }
}

function noop() {}

async function startEditor() {
  setDocumentTitle();
  trackServiceWorkerController();
  try {
    await registerServiceWorker();
  } catch (error) {
    // Service worker is optional for the editor shell.
  }
  setupCommsBridge();
  patchRedRuntime();
  try {
    RED.init({
      apiRootUrl: API_ROOT,
    });
    // Ensure runtime buttons are enabled even before comms events arrive
    RED.events.on('flows:loaded', () => {
      RED.events.emit('runtime-state', { state: 'start', deploy: true });
    });
  } catch (error) {
    console.error('Failed to initialise RED', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startEditor, { once: true });
} else {
  startEditor();
}

window.edgeNodeRed = Object.freeze({
  apiRoot: API_ROOT,
});
