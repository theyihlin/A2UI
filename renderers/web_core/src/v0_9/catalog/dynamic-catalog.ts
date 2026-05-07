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

import {Catalog, ComponentApi} from './types.js';

/**
 * Configuration options for initializing a DynamicCatalog.
 */
export interface DynamicCatalogOptions {
  /** Array of components already pre-registered in-memory (Offline/Local Dev support). */
  preRegisteredComponents?: ComponentApi[];
  /** Switch to toggle strict Subresource Integrity (SRI) and approved domain checking. Default: 'Strict' */
  securityMode?: 'Strict' | 'Development';
  /** Set of approved host/domain names permitted to load components in Strict mode. */
  approvedDomains?: string[];
}

/**
 * A dynamically composable catalog that supports zero-update dynamic downloading of A2UI components.
 */
export class DynamicCatalog<T extends ComponentApi = ComponentApi> extends Catalog<T> {
  readonly url: string;
  private readonly securityMode: 'Strict' | 'Development';
  private readonly approvedDomains: string[];
  private catalogJsonPromise: Promise<any> | null = null;
  private catalogJson: any = null;
  private readonly loadedComponentsMap = new Map<string, T>();

  constructor(url: string, options: DynamicCatalogOptions = {}) {
    super(url, []);
    this.url = url;
    this.securityMode = options.securityMode || 'Strict';
    this.approvedDomains = options.approvedDomains || [
      'https://cdn.a2ui.org',
      'https://github.com/google/A2UI',
      'https://raw.githubusercontent.com/google/A2UI',
    ];

    // Link the base Catalog's components map to our reactive Map
    (this as any).components = this.loadedComponentsMap;

    // Load pre-registered components into our loaded components map
    if (options.preRegisteredComponents) {
      for (const comp of options.preRegisteredComponents) {
        this.loadedComponentsMap.set(comp.name, comp as T);
      }
    }
  }

  /**
   * Resolves and returns the catalog JSON definition. Performs asynchronous fetching if not cached.
   */
  async fetchCatalogJson(): Promise<any> {
    if (this.catalogJson) return this.catalogJson;
    if (this.catalogJsonPromise) return this.catalogJsonPromise;

    this.catalogJsonPromise = fetch(this.url)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch catalog from ${this.url}: ${res.statusText}`);
        }
        return res.json();
      })
      .then(json => {
        this.catalogJson = json;
        return json;
      });

    return this.catalogJsonPromise;
  }

  /**
   * Scans the catalog definition and preloads all declared dynamic custom components in parallel.
   * This gets the client completely ready to render any component in the catalog instantly.
   */
  async preload(): Promise<void> {
    const catalogJson = await this.fetchCatalogJson();
    const componentKeys = Object.keys(catalogJson.components || {});

    const loadPromises = componentKeys.map(name => {
      const componentSchema = catalogJson.components[name];
      const metadata = componentSchema?.['x-a2ui-component'] || componentSchema?.['a2ui'];
      if (metadata?.uri) {
        return this.loadComponent(name).catch(err => {
          console.error(`Failed to preload dynamic component '${name}':`, err);
          return null;
        });
      }
      return Promise.resolve(null);
    });

    await Promise.all(loadPromises);
  }

  /**
   * Securely downloads and registers a component definition by name from the catalog JSON metadata.
   *
   * @param name The unique ID/name of the A2UI component (e.g. 'McpApp').
   * @returns Resolves with the successfully loaded ComponentApi, or null if not present in catalog.
   */
  async loadComponent(name: string): Promise<T | null> {
    // Return cached definition immediately if already loaded/pre-registered
    if (this.loadedComponentsMap.has(name)) {
      return this.loadedComponentsMap.get(name)!;
    }

    const catalogJson = await this.fetchCatalogJson();
    const componentSchema = catalogJson.components?.[name];
    if (!componentSchema) {
      console.warn(`Component '${name}' is not defined in catalog schema.`);
      return null;
    }

    // Support both 'x-a2ui-component' and 'a2ui' namespaces
    const metadata = componentSchema['x-a2ui-component'] || componentSchema['a2ui'];
    if (!metadata) {
      console.warn(`Component '${name}' has no dynamic loader metadata.`);
      return null;
    }

    const {uri, sri} = metadata;
    if (!uri) {
      console.warn(`Component '${name}' metadata is missing 'uri'.`);
      return null;
    }

    // Strict security mode validations
    if (this.securityMode === 'Strict') {
      // 1. Validate that the domain is approved
      const isApproved = this.approvedDomains.some(domain => uri.startsWith(domain));
      if (!isApproved) {
        throw new Error(
          `Security Error: Component URI '${uri}' is not within an approved A2UI domain in Strict mode.`,
        );
      }

      // 2. Validate that a subresource integrity signature is defined
      if (!sri) {
        throw new Error(
          `Security Error: Component URI '${uri}' must define an integrity (SRI) hash in Strict mode.`,
        );
      }
    }

    return new Promise<T>((resolve, reject) => {
      // 1. Hook global A2UI register callback
      const globalA2ui = (window as any).A2UI || {};
      (window as any).A2UI = globalA2ui;

      const originalRegister = globalA2ui.registerComponent;
      globalA2ui.registerComponent = (compName: string, compDef: any) => {
        if (compName === name) {
          const resolvedComp = {
            name: compDef.name,
            tagName: compDef.tagName,
            schema: compDef.schema,
          } as unknown as T;
          this.loadedComponentsMap.set(name, resolvedComp);
          resolve(resolvedComp);
        }
        if (originalRegister) {
          originalRegister(compName, compDef);
        }
      };

      // 2. Inject script tag
      const script = document.createElement('script');
      script.src = uri;
      script.type = 'module';
      script.crossOrigin = 'anonymous';

      if (sri && this.securityMode === 'Strict') {
        script.integrity = sri;
      }

      script.onload = () => {
        // Wait briefly to ensure evaluation completed and element registration succeeded
        setTimeout(() => {
          if (this.loadedComponentsMap.has(name)) return;

          // Fallback: Check if the native custom element is defined in browser registry
          const tagName = `a2ui-${name.toLowerCase()}`;
          if (customElements.get(tagName)) {
            const resolvedComp = {
              name,
              tagName,
              schema: {parse: (v: any) => v},
            } as unknown as T;
            this.loadedComponentsMap.set(name, resolvedComp);
            resolve(resolvedComp);
          } else {
            reject(
              new Error(
                `Dynamic script for '${name}' loaded but component did not register correctly.`,
              ),
            );
          }
        }, 50);
      };

      script.onerror = () => {
        reject(
          new Error(
            `Failed to download component script from URI '${uri}'. Subresource Integrity check may have failed.`,
          ),
        );
      };

      document.head.appendChild(script);
    });
  }
}
