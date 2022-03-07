/**
 * @typedef {{action: 'join', payload: {chat: string, name: string, connection: string}, initiatorConnection: string | null}} JoinQueueItem
 * @typedef {{action: 'leave', payload: {chat: string, name: string, connection: string}, initiatorConnection: string | null}} LeaveQueueItem
 * @typedef {{action: 'postMessage', payload: {chat: string, name: string, message: string}, initiatorConnection: string | null}} PostMessageQueueItem
 * @typedef {{action: 'disconnect', payload: {connection: string}, initiatorConnection: string | null}} DisconnectQueueItem
 *
 * @typedef {JoinQueueItem | LeaveQueueItem | PostMessageQueueItem | DisconnectQueueItem} QueueItem
 * @typedef {{[K in QueueItem['action']]: QueueItem & {action: K}}} QueueItemMap
 */

/**
 * @template T
 * @typedef {(api: import('aws-sdk').ApiGatewayManagementApi, repo: import('./repo.js'), item: T) => Promise<unknown>} ItemHandler<T>
 */

module.exports = {};
