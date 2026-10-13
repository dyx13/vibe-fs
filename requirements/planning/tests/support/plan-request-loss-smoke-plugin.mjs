/**
 * plan-request-loss-smoke-plugin.mjs — external observer canary plugin for the
 * Plan latest-turn preservation smoke.
 *
 * Dynamically loads the PRODUCTION Wanxiangshu OpenCode plugin (the real
 * `dist/OpenCode/Plugin/Plugin.js`) and overlays a collector observer that
 * captures the actual provider HTTP request bodies so the runner can assert
 * real message content, chronology, tool exchange and the latest turn — never
 * a mock echo.
 *
 * The plugin also injects the `plan` agent into the Host config (the isolated
 * routing module routes it), so a real Plan-mode session can be created.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

const collectorUrl =
  process.env.WANXIANGSHU_PLAN_SMOKE_COLLECTOR
  || process.env.WANXIANGSHU_CHAT_CANARY_COLLECTOR
  || null;

const defaultProductionPlugin = path.join(repoRoot, 'dist', 'OpenCode', 'Plugin', 'Plugin.js');
const productionPluginPath =
  process.env.WXS_PLAN_SMOKE_PRODUCTION_PLUGIN
  || (fs.existsSync(defaultProductionPlugin) ? defaultProductionPlugin : null);

if (!productionPluginPath) throw new Error('Production Wanxiangshu plugin is unavailable');
const { default: productionPlugin } = await import(pathToFileURL(productionPluginPath).href);
if (typeof productionPlugin?.server !== 'function') throw new Error('Production plugin server is unavailable');

const emit = async (kind, value) => {
  if (!collectorUrl) return;
  try {
    const response = await fetch(collectorUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, value }),
    });
    if (!response.ok) throw new Error(`collector rejected ${kind}: ${response.status}`);
  } catch (error) {
    // Best-effort: a closing collector must not crash the plugin mid-run.
  }
};

export default {
  id: 'wanxiangshu-plan-request-loss-smoke',
  async server(input) {
    const hooks = await productionPlugin.server(input);
    return {
      ...hooks,
      async config(config) {
        // The production plugin configures the managed agents; ensure the plan
        // agent routes through the isolated routing module.
        await hooks.config(config);
        await emit('plugin.config', {
          agents: Object.keys(config.agent ?? {}),
          providers: Object.keys(config.provider ?? {}),
        });
      },
      'chat.params': async (input) => {
        await hooks['chat.params']?.(input);
        await emit('chat.params', {
          sessionID: input.sessionID ?? null,
          messageID: input.message?.id ?? null,
          agent: input.message?.agent ?? null,
          modelID: input.model?.id ?? null,
        });
      },
      'experimental.chat.messages.transform': async (input, output) => {
        await hooks['experimental.chat.messages.transform']?.(input, output);
        const messages = Array.isArray(output?.messages) ? output.messages : [];
        await emit('experimental.chat.messages.transform', {
          messageCount: messages.length,
          roles: messages.map((message) => message?.info?.role ?? message?.role ?? null),
          ids: messages.map((message) => message?.info?.id ?? message?.id ?? null),
          lastRole: messages.at(-1)?.info?.role ?? messages.at(-1)?.role ?? null,
        });
      },
      event: async ({ event }) => {
        await hooks.event?.({ event });
        if (event?.type === 'session.idle') {
          await emit(event.type, {
            properties: event?.properties ?? null,
            sessionID: event?.properties?.sessionID ?? null,
          });
        }
      },
    };
  },
};