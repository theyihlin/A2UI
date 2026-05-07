/*
 * Copyright 2025 Google LLC
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

import {nothing} from 'lit';
import {html, unsafeStatic} from 'lit/static-html.js';
import {ComponentContext, Catalog, DynamicCatalog} from '@a2ui/web_core/v0_9';
import {LitComponentApi} from '@a2ui/lit/v0_9';

/**
 * Pure function that acts as a generic container for A2UI components.
 *
 * It dynamically resolves and renders the specific Lit component implementation
 * based on the component type provided in the context, returning a TemplateResult directly
 * to avoid duplicate DOM node wrapping. Supports dynamic loading and rendering for DynamicCatalogs.
 *
 * @param context The component context defining the data model and type to render.
 * @param catalog The catalog of component implementations.
 * @returns A Lit TemplateResult representing the resolved component, or a loading shimmer/nothing if unresolvable.
 */
export function renderA2uiNode(context: ComponentContext, catalog: Catalog<LitComponentApi>) {
  const type = context.componentModel.type;
  const implementation = catalog.components.get(type);

  if (!implementation) {
    if (catalog instanceof DynamicCatalog) {
      catalog.loadComponent(type)
        .then(() => {
          // Trigger reactive re-render by triggering component update
          context.componentModel.properties = { ...context.componentModel.properties };
        })
        .catch(err => {
          console.error(`Error loading dynamic component '${type}':`, err);
        });

      // Render a premium loading shimmer/spinner placeholder in place
      return html`
        <div class="a2ui-loading-shimmer" style="padding: 16px; border: 1px dashed var(--a2ui-color-border, #ccc); border-radius: 8px; display: flex; align-items: center; gap: 12px; background: #fafafa;">
          <div class="a2ui-spinner" style="width: 18px; height: 18px; border: 2px solid rgba(0,0,0,0.1); border-left-color: var(--a2ui-color-primary, #17e); border-radius: 50%; animation: a2ui-spin 1s linear infinite;"></div>
          <div style="font-family: var(--a2ui-font-family, sans-serif); font-size: 13px; color: var(--a2ui-color-text-muted, #666); font-weight: 500;">Loading ${type} component...</div>
        </div>
        <style>
          @keyframes a2ui-spin { to { transform: rotate(360deg); } }
        </style>
      `;
    }

    console.warn(`Component implementation not found for type: ${type}`);
    return nothing;
  }

  const tag = unsafeStatic(implementation.tagName);
  return html`<${tag} .context=${context}></${tag}>`;
}
