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

import assert from 'node:assert';
import {describe, it, beforeEach, afterEach} from 'node:test';
import {DynamicCatalog} from './dynamic-catalog.js';

describe('DynamicCatalog', () => {
  let originalFetch: typeof global.fetch;
  let originalWindow: any;
  let originalDocument: any;
  let originalCustomElements: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalWindow = (global as any).window;
    originalDocument = (global as any).document;
    originalCustomElements = (global as any).customElements;

    // Mock Window & Document
    const mockWindow: any = {
      location: {origin: 'http://localhost:8000'},
      A2UI: {},
    };
    (global as any).window = mockWindow;

    const mockDocument: any = {
      createElement: (tagName: string) => {
        if (tagName === 'script') {
          return {
            src: '',
            type: '',
            crossOrigin: '',
            integrity: '',
            onload: null,
            onerror: null,
          };
        }
        return {};
      },
      head: {
        appendChild: (element: any) => {
          // Simulate script loaded callback
          setTimeout(() => {
            if (element.onload) {
              // Simulate element registration
              mockWindow.A2UI.registerComponent('McpApp', {
                name: 'McpApp',
                tagName: 'a2ui-web-mcp-app',
                schema: {parse: (v: any) => v},
              });
              element.onload();
            }
          }, 5);
        },
      },
    };
    (global as any).document = mockDocument;

    // Mock customElements registry
    const mockCustomElements = {
      get: () => null,
    };
    (global as any).customElements = mockCustomElements;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (global as any).window = originalWindow;
    (global as any).document = originalDocument;
    (global as any).customElements = originalCustomElements;
  });

  it('fetches and parses JSON catalog correctly', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        McpApp: {
          type: 'object',
          a2ui: {
            uri: 'https://cdn.a2ui.org/components/mcp-app.js',
            sri: 'sha384-somecryptographichash',
          },
        },
      },
    };

    global.fetch = (url: any) => {
      assert.strictEqual(url, 'https://a2ui.org/catalogs/test.json');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);
    };

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json');
    const json = await catalog.fetchCatalogJson();

    assert.strictEqual(json.catalogId, 'https://a2ui.org/catalogs/test.json');
    assert.ok(json.components.McpApp);
  });

  it('securely loads a component from approved domain with valid SRI in Strict mode', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        McpApp: {
          type: 'object',
          'x-a2ui-component': {
            uri: 'https://cdn.a2ui.org/components/mcp-app.js',
            sri: 'sha384-somecryptographichash',
          },
        },
      },
    };

    global.fetch = () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json');
    const component = await catalog.loadComponent('McpApp');

    assert.ok(component);
    assert.strictEqual(component.name, 'McpApp');
    assert.strictEqual((component as any).tagName, 'a2ui-web-mcp-app');
  });

  it('rejects component loading from an unapproved domain in Strict mode', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        McpApp: {
          type: 'object',
          'x-a2ui-component': {
            uri: 'https://malicious-domain.com/mcp-app.js',
            sri: 'sha384-somecryptographichash',
          },
        },
      },
    };

    global.fetch = () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json', {
      securityMode: 'Strict',
    });

    await assert.rejects(
      () => catalog.loadComponent('McpApp'),
      (err: any) => {
        return (
          err.message.includes('Security Error: Component URI') &&
          err.message.includes('not within an approved A2UI domain')
        );
      },
    );
  });

  it('rejects component loading without an SRI signature in Strict mode', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        McpApp: {
          type: 'object',
          'x-a2ui-component': {
            uri: 'https://cdn.a2ui.org/components/mcp-app.js',
          },
        },
      },
    };

    global.fetch = () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json', {
      securityMode: 'Strict',
    });

    await assert.rejects(
      () => catalog.loadComponent('McpApp'),
      (err: any) => {
        return (
          err.message.includes('Security Error: Component URI') &&
          err.message.includes('must define an integrity (SRI) hash')
        );
      },
    );
  });

  it('allows component loading from localhost and without SRI in Development mode', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        McpApp: {
          type: 'object',
          'x-a2ui-component': {
            uri: 'http://localhost:8000/components/mcp-app.js',
          },
        },
      },
    };

    global.fetch = () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);

    // Overwrite appendChild to simulate development element load
    (global as any).document.head.appendChild = (element: any) => {
      setTimeout(() => {
        (global as any).window.A2UI.registerComponent('McpApp', {
          name: 'McpApp',
          tagName: 'a2ui-web-mcp-app',
          schema: {parse: (v: any) => v},
        });
        element.onload();
      }, 5);
    };

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json', {
      securityMode: 'Development',
    });

    const component = await catalog.loadComponent('McpApp');
    assert.ok(component);
    assert.strictEqual(component.name, 'McpApp');
  });

  it('preloads all dynamic components in parallel upon preload() invocation', async () => {
    const mockCatalogJson = {
      catalogId: 'https://a2ui.org/catalogs/test.json',
      components: {
        Text: {type: 'object'},
        McpApp: {
          type: 'object',
          'x-a2ui-component': {
            uri: 'https://cdn.a2ui.org/components/mcp-app.js',
            sri: 'sha384-somecryptographichash',
          },
        },
      },
    };

    global.fetch = () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCatalogJson),
      } as any);

    const catalog = new DynamicCatalog('https://a2ui.org/catalogs/test.json');
    await catalog.preload();

    const component = catalog.components.get('McpApp');
    assert.ok(component);
    assert.strictEqual(component.name, 'McpApp');
  });
});
