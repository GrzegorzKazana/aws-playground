/**
 * @typedef {{type: 'join', payload: {chat: string, name: string, connection: string}, initiatorConnection: string | null}} JoinQueueItem
 * @typedef {{type: 'leave', payload: {chat: string, name: string, connection: string}, initiatorConnection: string | null}} LeaveQueueItem
 * @typedef {{type: 'postMessage', payload: {chat: string, name: string, message: string}, initiatorConnection: string | null}} PostMessageQueueItem
 * @typedef {{type: 'disconnect', payload: {connection: string}, initiatorConnection: string | null}} DisconnectQueueItem
 *
 * @typedef {JoinQueueItem | LeaveQueueItem | PostMessageQueueItem | DisconnectQueueItem} QueueItem
 * @typedef {{[K in QueueItem['type']]: QueueItem & {type: K}}} QueueItemMap
 */

/**
 * @template T
 * @typedef {(api: import('aws-sdk').ApiGatewayManagementApi, repo: import('./repo.js'), item: T) => Promise<unknown>} ItemHandler<T>
 */

module.exports = {};
