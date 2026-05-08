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

class A2uiWebMcpApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._context = null;
    this._unsubscribe = null;
    this.iframe = null;
    this.messageHandler = null;
  }

  set context(value) {
    this._context = value;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    if (value && value.componentModel) {
      const sub = value.componentModel.onUpdated.subscribe(() => {
        this.render();
      });
      this._unsubscribe = () => sub.unsubscribe();
    }

    this.render();
  }

  get context() {
    return this._context;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }

  render() {
    if (!this.context) return;
    const props = this.context.componentModel.properties || {};
    const htmlContent = props.htmlContent || '';
    const height = props.height;
    const allowedTools = props.allowedTools || [];

    const iframeStyle = height ? `height: ${height}px;` : 'aspect-ratio: 4/3;';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          border: 1px solid var(--a2ui-color-border, #eee);
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          background: #fff;
          box-sizing: border-box;
        }
        .iframe-container {
          position: relative;
          width: 100%;
          ${iframeStyle}
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: #f5f5f5;
          transition: height 0.3s ease-out, min-width 0.3s ease-out;
        }
      </style>
      <div class="iframe-container">
        <iframe
          id="mcp-sandbox"
          referrerpolicy="origin"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </div>
    `;

    this.iframe = this.shadowRoot.querySelector('iframe');
    if (this.iframe && htmlContent) {
      this.initializeSandbox(this.iframe, htmlContent, allowedTools);
    }
  }

  async initializeSandbox(iframe, htmlContent, allowedTools) {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }

    // 1. Set up standard local sandbox proxy path
    const sandboxUrl = `${window.location.origin}/shared/mcp_apps_inner_iframe/sandbox.html?disable_security_self_test=true`;

    const readyNotification = 'ui/notifications/sandbox-proxy-ready';

    // 2. Promise resolving when sandbox proxy declares readiness
    const proxyReady = new Promise(resolve => {
      const listener = ({source, data, origin}) => {
        if (
          source === iframe.contentWindow &&
          origin === window.location.origin &&
          data?.method === readyNotification
        ) {
          window.removeEventListener('message', listener);
          resolve(true);
        }
      };
      window.addEventListener('message', listener);
    });

    iframe.src = sandboxUrl;
    await proxyReady;

    // 3. Connect via postMessage JSON-RPC
    const msgId = 1;
    iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        clientInfo: { name: 'A2UI Client Host', version: '1.0.0' },
        capabilities: { serverTools: {}, updateModelContext: { text: {} } },
        configuration: { hostContext: { theme: 'light', platform: 'web', displayMode: 'inline' } }
      },
      id: msgId
    }, window.location.origin);

    // 4. Listen for incoming notifications and requests from outer sandbox
    this.messageHandler = async ({source, data, origin}) => {
      if (source !== iframe.contentWindow || origin !== window.location.origin) return;

      // Handle auto-resize size changes
      if (data.method === 'ui/notifications/size-changed' || data.method === 'size-changed') {
        const {width, height} = data.params || {};
        if (width !== undefined) {
          iframe.style.minWidth = `min(${width}px, 100%)`;
        }
        if (height !== undefined) {
          iframe.style.height = `${height}px`;
        }
      }

      // Forward whitelisted tool calls to the A2UI action system
      if (data.method === 'ui/requests/call-tool' || data.method === 'call-tool') {
        const {name, arguments: args} = data.params || {};
        const requestId = data.id;

        if (allowedTools.includes(name)) {
          this.context.dispatchAction({
            event: {
              name: name,
              context: args || {}
            }
          });

          iframe.contentWindow.postMessage({
            jsonrpc: '2.0',
            result: { content: [{ type: 'text', text: 'Action dispatched to A2UI Agent' }] },
            id: requestId
          }, window.location.origin);
        } else {
          console.warn(`[McpApp] Tool '${name}' rejected as it is not listed in allowedTools.`);
          iframe.contentWindow.postMessage({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Tool not allowed' },
            id: requestId
          }, window.location.origin);
        }
      }
    };

    window.addEventListener('message', this.messageHandler);

    // 5. Trigger sandbox inner loading
    iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-resource-ready',
      params: {
        html: htmlContent,
        sandbox: 'allow-scripts allow-forms allow-popups allow-modals'
      }
    }, window.location.origin);
  }
}

customElements.define('a2ui-web-mcp-app', A2uiWebMcpApp);

if (window.A2UI && window.A2UI.registerComponent) {
  window.A2UI.registerComponent('McpApp', {
    name: 'McpApp',
    tagName: 'a2ui-web-mcp-app',
    schema: {
      parse: (v) => v
    }
  });
}
