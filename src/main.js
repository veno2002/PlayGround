import { Game } from './game.js';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');
const unsupported = document.getElementById('unsupported');

function supportsWebGL2() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (!supportsWebGL2()) {
  loading.classList.add('done');
  unsupported.classList.remove('is-hidden');
} else {
  try {
    const game = new Game(canvas);
    window.__ARENA_READY__ = true;
    window.__game = game;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      game.pause?.();
    });
  } catch (error) {
    console.error(error);
    loading.classList.add('done');
    unsupported.classList.remove('is-hidden');
    unsupported.querySelector('h2').textContent = 'ARENA FAILED TO IGNITE';
    unsupported.querySelector('p').textContent = 'WebGL could not start on this device. Reload the page or try a recent desktop browser with hardware acceleration enabled.';
  }
}
