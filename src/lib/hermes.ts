// DEPRECATED: Hermes/OpenCode Zen stack has been removed.
// This module is kept as an empty stub to prevent import errors
// from the hermes route stubs during build.

export const HERMES_MODELS: any[] = []
export const HERMES_DEFAULT_MODEL = ''
export function isValidHermesModel(_m: string): boolean { return false }
export function getHermesModel(_id: string): any { return null }
export function getUpstreamUrl(_m: any): string { return '' }
export function buildUpstreamBody(_m: any, _p: any): any { return {} }
export function validateChatPayload(_p: any): { valid: boolean; error?: string } { return { valid: false, error: 'Hermes is deprecated' } }
