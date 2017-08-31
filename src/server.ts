
import * as Koa from 'koa'

import JsonRpc from './jsonrpc'

const rpc = new JsonRpc()

const app = new Koa()

app.use(rpc.middleware)

rpc.register('test', (hello: string) => {
    return {hello}
})

app.listen(9943)
