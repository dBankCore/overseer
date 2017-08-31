/**
 * @file JSON RPC 2.0 middleware for Koa.
 * @author Johan Nordberg <johan@steemit.com>
 * Implemented according to http://www.jsonrpc.org/specification
 */

import * as assert from 'assert'
import * as koa from 'koa'
import {VError} from 'verror'

import {readJson} from './utils'

// https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically
// tslint:disable-next-line
const STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg
const ARGUMENT_NAMES = /([^\s,]+)/g
function getParamNames(func) {
  const fnStr = func.toString().replace(STRIP_COMMENTS, '')
  const result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
  return result || []
}

export enum JsonRpcErrorCode {
    ParseError     = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams  = -32602,
    InternalError  = -32603,
}

export type JsonRpcId = string | number | null

function isValidId(id: JsonRpcId) {
    return id === null || id === undefined || typeof id === 'string' || (
        typeof id === 'number' && Number.isSafeInteger(id)
    )
}

function isValidResponse(response: JsonRpcResponse) {
    return (response.id !== null && response.id !== undefined) || response.error !== undefined
}

function resolveParams(params: any[] | {[key: string]: any}, names: string[]) {
    assert(typeof params === 'object', 'not an object or array')
    if (!Array.isArray(params)) {
        // resolve named arguments to positional
        const rv: any[] = names.map(() => undefined)
        for (const key of Object.keys(params)) {
            const idx = names.indexOf(key)
            assert(idx !== -1, `unknown param: ${ key }`)
            rv[idx] = params[key]
        }
        return rv
    } else {
        return params
    }
}

export class JsonRpcError extends VError {

    public readonly name = 'RPCError'
    public readonly code: number

    constructor(code: number, ...params) {
        // workaround for https://github.com/DefinitelyTyped/DefinitelyTyped/pull/19479
        super(params[0], ...(params.slice(1)))
        this.code = code
    }

    public toJSON() {
        const code = this.code
        const data = JsonRpcError.info(this)
        const message = this.message
        if (Object.keys(data).length > 0) {
            return {code, data, message}
        } else {
            return {code, message}
        }

    }

}

export class JsonRpcResponse {

    public readonly jsonrpc: string = '2.0'

    constructor(
        public readonly id: JsonRpcId,
        public readonly result?: any,
        public readonly error?: JsonRpcError,
    ) {
        assert(!result || !error, 'must specify either result or error')
        assert(!(result && error), 'result and error are mutually exclusive')
    }

    public toJSON() {
        const {jsonrpc, id, error, result} = this
        if (error) {
            return {jsonrpc, id, error}
        } else {
            return {jsonrpc, id, result}
        }
    }

}

export class JsonRpcRequest {

    public static from(data: any) {
        const {jsonrpc, method, params, id} = data
        return new JsonRpcRequest(jsonrpc, id, method, params)
    }

    constructor(
        public readonly jsonrpc: string,
        public readonly id: JsonRpcId,
        public readonly method: string,
        public readonly params?: any,
    ) {
        assert(jsonrpc === '2.0', 'invalid rpc version')
        assert(isValidId(id), 'invalid id')
        assert(typeof method === 'string', 'invalid method')
    }

}

export type JsonRpcMethod = (...params) => any

export default class JsonRpc {

    public readonly methods: {
        [name: string]: {method: JsonRpcMethod, params: string[]},
    } = {}

    /**
     * Register a rpc method.
     * @param name    Method name.
     * @param method  Method implementation.
     */
    public register(name: string,  method: JsonRpcMethod) {
        assert(!this.methods[name], 'method already exists')
        const params = getParamNames(method)
        this.methods[name] = {method, params}
    }

    public middleware = async (ctx: koa.Context, next: () => Promise<any>) => {
        if (ctx.method !== 'POST') {
            ctx.status = 405
            ctx.body = new JsonRpcResponse(null, null,
                new JsonRpcError(JsonRpcErrorCode.InvalidRequest, {}, 'Method Not Allowed'),
            )
            return await next()
        }

        let data: any
        try {
            data = await readJson(ctx.req)
        } catch (cause) {
            ctx.status = 400
            ctx.body = new JsonRpcResponse(null, null,
                new JsonRpcError(JsonRpcErrorCode.ParseError, {cause}, 'Parse error'),
            )
            return await next()
        }

        // spec says an empty batch request is invalid
        if (Array.isArray(data) && data.length === 0) {
            ctx.status = 400
            ctx.body = new JsonRpcResponse(null, null,
                new JsonRpcError(JsonRpcErrorCode.InvalidRequest, 'Invalid Request'),
            )
            return await next()
        }

        ctx.status = 200
        if (Array.isArray(data)) {
            const responses = (await Promise.all(data.map(this.handleRequest))).filter(isValidResponse)
            ctx.body = (responses.length > 0) ? responses : ''
        } else {
            const response = await this.handleRequest(data)
            ctx.body = isValidResponse(response) ? response : ''
        }

        return await next()
    }

    private handleRequest = async (data: any) => {
        let request: JsonRpcRequest
        try {
            request = JsonRpcRequest.from(data)
        } catch (cause) {
            const error = new JsonRpcError(JsonRpcErrorCode.InvalidRequest, {cause}, 'Invalid Request')
            return new JsonRpcResponse(null, null, error)
        }
        const handler = this.methods[request.method]
        if (!handler) {
            const error = new JsonRpcError(JsonRpcErrorCode.MethodNotFound, 'Method not found')
            return new JsonRpcResponse(request.id, null, error)
        }

        let params: any[]
        try {
            if (request.params !== undefined) {
                params = resolveParams(request.params, handler.params)
            } else {
                params = []
            }
        } catch (cause) {
            const error = new JsonRpcError(JsonRpcErrorCode.InvalidParams, {cause}, 'Invalid params')
            return new JsonRpcResponse(request.id, null, error)
        }

        let result: any
        try {
            result = await handler.method(...params)
        } catch (error) {
            if (!(error instanceof JsonRpcError)) {
                error = new JsonRpcError(JsonRpcErrorCode.InternalError, {cause: error}, 'Internal error')
            }
            return new JsonRpcResponse(request.id, null, error)
        }
        return new JsonRpcResponse(request.id, result || null)
    }
}
