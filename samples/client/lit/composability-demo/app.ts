/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Catalog,
  ComponentContext,
  SurfaceModel,
  ComponentModel,
} from '@a2ui/web_core/v0_9';
import {renderA2uiNode, basicCatalog} from '@a2ui/lit/v0_9';
import {render, html} from 'lit';

// Import local custom elements statically
import {LocalWidget} from './components/local-widget.js';
import {McpApp} from './components/mcp-app.js';

// --- Logger helper ---
const consoleEl = document.getElementById('console') as HTMLElement;
function log(msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${time}] ${msg}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// --- COMPILE-TIME STATIC CATALOG BUNDLINGS ---
log('Statically pre-compiling and packaging catalogs...', 'info');

// 1. Basic Catalog: only primitives
const clientBasicCatalog = new Catalog(
  'https://a2ui.org/catalogs/v1/basic-catalog.json',
  [
    basicCatalog.components.get('Text')!,
    basicCatalog.components.get('Button')!
  ]
);

// 2. Weather Catalog: primitives + LocalWeatherWidget
const clientWeatherCatalog = new Catalog(
  'https://a2ui.org/catalogs/v1/weather-catalog.json',
  [
    basicCatalog.components.get('Text')!,
    basicCatalog.components.get('Button')!,
    LocalWidget as any
  ]
);

// 3. Generative MCP Catalog: primitives + McpApp iframe sandbox
const clientMcpCatalog = new Catalog(
  'https://a2ui.org/catalogs/v1/mcp-catalog.json',
  [
    basicCatalog.components.get('Text')!,
    basicCatalog.components.get('Button')!,
    McpApp as any
  ]
);

log('Statically pre-registered 3 distinct catalogs in Swift/iOS compile-time style.', 'success');

// --- State & Persistence Management ---
type CatalogKey = 'basic' | 'weather' | 'mcp';
let activeCatalogKey: CatalogKey = (localStorage.getItem('active_catalog_key') as CatalogKey) || 'basic';

const catalogMap: Record<CatalogKey, Catalog<any>> = {
  basic: clientBasicCatalog,
  weather: clientWeatherCatalog,
  mcp: clientMcpCatalog
};

// --- Reactive UI Ingesting ---

function ingestCatalog(key: CatalogKey) {
  activeCatalogKey = key;
  localStorage.setItem('active_catalog_key', key);
  const catalog = catalogMap[key];

  log(`[Ingestion] Active catalog set to: ${catalog.id}`, 'info');
  log(`[Registry] Instantly registered ${catalog.components.size} components. Ready to render!`, 'success');

  // 1. Update Selector Button classes
  const buttons: Record<CatalogKey, HTMLElement> = {
    basic: document.getElementById('btn-basic-catalog')!,
    weather: document.getElementById('btn-weather-catalog')!,
    mcp: document.getElementById('btn-mcp-catalog')!
  };

  Object.keys(buttons).forEach((k) => {
    const btn = buttons[k as CatalogKey];
    if (k === key) {
      btn.className = 'btn btn-primary';
    } else {
      btn.className = 'btn btn-secondary';
    }
  });

  // 2. Reactively re-build Component registry monitor list
  const registryList = document.getElementById('availability-list')!;
  const components = Array.from(catalog.components.keys());
  
  render(
    html`
      ${components.map(name => html`
        <div class="status-item">
          <span>${name}</span>
          <span class="badge badge-loaded">Ready</span>
        </div>
      `)}
    `,
    registryList
  );

  // 3. Reactively re-render Dynamic Surface Card
  renderActiveSurface(key, catalog);
}

// --- Surface Renderers ---

function renderActiveSurface(key: CatalogKey, catalog: Catalog<any>) {
  const container = document.getElementById('dynamic-surface-container')!;

  if (key === 'basic') {
    const surfaceModel = new SurfaceModel('surface-a', catalog as any);
    surfaceModel.componentsModel.addComponent(new ComponentModel('title-comp', 'Text', {
      text: 'Statically Ingested Basic Primitives',
      variant: 'h3'
    }));
    surfaceModel.componentsModel.addComponent(new ComponentModel('btn-comp', 'Button', {
      child: 'btn-label',
      action: { event: { name: 'standard_button_click' } }
    }));
    surfaceModel.componentsModel.addComponent(new ComponentModel('btn-label', 'Text', {
      text: 'Action Call Button'
    }));

    surfaceModel.onAction.subscribe((action) => {
      log(`[Action Dispatch] Standard Button clicked: ${JSON.stringify(action)}`, 'success');
    });

    const ctxText = new ComponentContext(surfaceModel, 'title-comp');
    const ctxBtn = new ComponentContext(surfaceModel, 'btn-comp');

    render(
      html`
        <div class="card">
          <div class="card-title">
            <span>Active Surface: Standard Primitives</span>
            <span style="font-size:12px; color:var(--success-color);">Active</span>
          </div>
          <div class="card-body" style="padding: 28px;">
            ${renderA2uiNode(ctxText, catalog as any)}
            <div style="margin-top: 16px;">
              ${renderA2uiNode(ctxBtn, catalog as any)}
            </div>
          </div>
        </div>
      `,
      container
    );
  }

  if (key === 'weather') {
    const surfaceModel = new SurfaceModel('surface-b', catalog as any);
    surfaceModel.componentsModel.addComponent(new ComponentModel('local-widget-comp', 'LocalWidget', {}));
    
    surfaceModel.onAction.subscribe((action) => {
      log(`[Action Dispatch] Weather Refresh clicked: ${JSON.stringify(action)}`, 'success');
      
      if (action.name === 'refresh_weather') {
        // Render simulated success panel
        const prevResult = container.querySelector('.agent-result');
        if (prevResult) prevResult.remove();

        const resultEl = document.createElement('div');
        resultEl.className = 'agent-result';
        resultEl.style.cssText = 'margin: 20px 28px 28px 28px; padding: 16px; background: rgba(99, 102, 241, 0.08); border: 1px solid var(--primary-color); border-radius: 12px; color: #a5b4fc; font-size: 13px; font-weight: 600; text-align: center; animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(99,102,241,0.15);';
        resultEl.innerHTML = `⚡ Agent Simulation: Weather refresh complete! (SF forecasts updated)`;
        container.querySelector('.card')!.appendChild(resultEl);
      }
    });

    const ctx = new ComponentContext(surfaceModel, 'local-widget-comp');
    
    render(
      html`
        <div class="card">
          <div class="card-title">
            <span>Active Surface: Weather Showcase</span>
            <span style="font-size:12px; color:var(--success-color);">Active</span>
          </div>
          <div class="card-body">
            ${renderA2uiNode(ctx, catalog as any)}
          </div>
        </div>
      `,
      container
    );
  }

  if (key === 'mcp') {
    const surfaceModel = new SurfaceModel('surface-c', catalog as any);
    surfaceModel.componentsModel.addComponent(new ComponentModel('mcp-app-comp', 'McpApp', {
      resourceUri: 'http://localhost:8000/components/mcp-app.js',
      allowedTools: ['calculate_sum'],
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; background: #111827; color: white; padding: 28px; text-align: center; margin: 0; box-sizing: border-box; }
            h3 { margin-top: 0; font-size: 18px; color: #a5b4fc; }
            p { font-size: 13px; color: #9ca3af; line-height: 1.5; margin-bottom: 16px; }
            button { background: #6366f1; color: white; border: none; padding: 10px 20px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(99,102,241,0.3); transition: all 0.2s; }
            button:hover { background: #4f46e5; transform: scale(1.03); }
            button:active { transform: scale(0.97); }
          </style>
        </head>
        <body>
          <h3>Interactive Sandbox Calculator</h3>
          <p>Standard double-sandboxed iframe communicating strictly via postMessage JSON-RPC.</p>
          <button onclick="window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/requests/call-tool', params: { name: 'calculate_sum', arguments: { x: 10, y: 15 } }, id: 42 }, '*')">
            Run Tool: calculate_sum(10, 15)
          </button>
        </body>
        </html>
      `
    }));

    surfaceModel.onAction.subscribe((action) => {
      log(`[Action Dispatch] Sandbox tool call: ${JSON.stringify(action)}`, 'success');
      
      if (action.name === 'calculate_sum') {
        const {x, y} = action.context || {};
        const sum = (Number(x) || 0) + (Number(y) || 0);
        log(`[Agent Simulator] Computing tool call: calculate_sum(${x}, ${y}) = ${sum}`, 'info');

        // Render simulated success panel
        const prevResult = container.querySelector('.agent-result');
        if (prevResult) prevResult.remove();

        const resultEl = document.createElement('div');
        resultEl.className = 'agent-result';
        resultEl.style.cssText = 'margin: 20px 28px 28px 28px; padding: 16px; background: rgba(16, 185, 129, 0.08); border: 1px solid var(--success-color); border-radius: 12px; color: var(--success-color); font-size: 13px; font-weight: 600; text-align: center; animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(16,185,129,0.15);';
        resultEl.innerHTML = `✓ Agent Simulated Tool Success: calculate_sum(${x}, ${y}) = ${sum}`;
        container.querySelector('.card')!.appendChild(resultEl);
      }
    });

    const ctx = new ComponentContext(surfaceModel, 'mcp-app-comp');
    
    render(
      html`
        <div class="card">
          <div class="card-title">
            <span>Active Surface: MCP App Sandbox</span>
            <span style="font-size:12px; color:var(--success-color);">Active</span>
          </div>
          <div class="card-body">
            ${renderA2uiNode(ctx, catalog as any)}
          </div>
        </div>
      `,
      container
    );
  }
}

// --- Initial Boot & Restoration ---
log(`Restoring previous session from localStorage: [${activeCatalogKey}]`, 'info');
ingestCatalog(activeCatalogKey);

// --- Handle Catalog Ingestion Clicks ---

const btnBasic = document.getElementById('btn-basic-catalog') as HTMLButtonElement;
const btnWeather = document.getElementById('btn-weather-catalog') as HTMLButtonElement;
const btnMcp = document.getElementById('btn-mcp-catalog') as HTMLButtonElement;

btnBasic.onclick = () => {
  log('[Ingestion] Ingesting basic primitive catalog...', 'info');
  ingestCatalog('basic');
};

btnWeather.onclick = () => {
  log('[Ingestion] Ingesting local custom weather catalog...', 'info');
  ingestCatalog('weather');
};

btnMcp.onclick = () => {
  log('[Ingestion] Ingesting generative MCP iframe catalog...', 'info');
  ingestCatalog('mcp');
};
