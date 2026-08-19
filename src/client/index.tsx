import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ArenaApp } from './ArenaApp.tsx'
import { ArenaClient } from './rpc.ts'
import { ARENA_STYLES } from './styles.ts'

export const inject = ['sessions', 'connection']
export const HOST_ID = 'dsh-blind-arena-host'
export const MOUNT_ID = 'dsh-blind-arena-root'

export const SHADOW_BASE_STYLES = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    isolation: isolate;
    color-scheme: dark;
  }
  #${MOUNT_ID} { position: absolute; inset: 0; pointer-events: none; }
`

export interface MountOptions {
  readonly preview?: boolean
}

export function mountArena(parent: HTMLElement, options: MountOptions = {}): () => void {
  const host = document.createElement('div')
  host.id = HOST_ID
  host.dataset.plugin = 'dsh-blind-arena'

  const shadow = host.attachShadow({ mode: 'open' })
  const base = document.createElement('style')
  base.textContent = SHADOW_BASE_STYLES
  const styles = document.createElement('style')
  styles.textContent = ARENA_STYLES
  const mount = document.createElement('div')
  mount.id = MOUNT_ID
  shadow.append(base, styles, mount)
  parent.append(host)

  const root: Root = createRoot(mount)
  root.render(createElement(ArenaApp, options))

  return () => {
    root.unmount()
    host.remove()
  }
}

export function apply(ctx: ClientContext): void {
  void ctx // services are consumed through ArenaClient inside React
  ctx.effect(() => mountArena(document.body, { preview: false }), 'dsh-blind-arena: shadow mount')
}
