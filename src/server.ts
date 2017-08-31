
import * as Koa from 'koa'

import JsonRpc from './jsonrpc'

const rpc = new JsonRpc()

const app = new Koa()

app.use(rpc.middleware)

rpc.register('test', (hello: string) => {
    return {hello}
})

let port = 8090
if (process.env.PORT) {
    port = parseInt(process.env.PORT as string, 10)
}

app.listen(port, () => {
    // tslint:disable-next-line
    console.log(`listening on ${ port }`)
})
