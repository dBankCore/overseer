/**
 * @file Overseer server.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as bunyan from 'bunyan'
import * as cluster from 'cluster'
import * as config from 'config'
import * as http from 'http'
import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as os from 'os'
import * as util from 'util'

import {JsonRpcAuth, requestLogger, rpcLogger} from '@steemit/koa-jsonrpc'

import {collect, writer} from './collector'
import {db, ensureDatabase} from './database'
import {logger} from './logger'
import {getPageviews} from './stats'
import {parseBool} from './utils'

export const app = new Koa()

const router = new Router()
const rpc = new JsonRpcAuth(config.get('rpc_node'), config.get('name'))

app.proxy = parseBool(config.get('proxy'))
app.on('error', (error) => {
    logger.error(error, 'Application error')
})

app.use(requestLogger(logger, config.get('request_log_level')))
app.use(rpcLogger(logger, config.get('rpc_log_level')))

router.post('/', rpc.middleware as any)

router.get('/.well-known/healthcheck.json', async (ctx, next) => {
    ctx.body = {ok: true}
})

app.use(router.routes() as any)

// legacy endpoint, remove when condenser uses collect
rpc.register('pageview', async function(account: string, page: string, referer: string) {
    this.log.info({account, page, referer}, 'recording pageview')
    await collect.call(this, 'pageview', {page})
})

rpc.register('collect', collect)
rpc.registerAuthenticated('collect_signed', collect)

rpc.register('get_pageviews', getPageviews)

async function main() {
    if (cluster.isMaster) {
        logger.info('starting')
        await ensureDatabase(db)
    }

    const server = http.createServer(app.callback())
    const listen = util.promisify(server.listen.bind(server))
    const close = util.promisify(server.close.bind(server))

    let numWorkers = Number.parseInt(config.get('num_workers'))
    if (numWorkers === 0) {
        numWorkers = os.cpus().length
    }
    if (cluster.isMaster && numWorkers > 1) {
        logger.info('spawning %d workers', numWorkers)
        for (let i = 0; i < numWorkers; i++) {
            cluster.fork()
        }
    } else {
        const port = config.get('port')
        await listen(port)
        logger.info('running on port %d', port)
    }

    const exit = async () => {
        await Promise.all([writer.destroy(), close])
        process.exit()
    }

    process.on('SIGTERM', () => {
        logger.info('got SIGTERM, exiting...')
        exit().catch((error) => {
            logger.fatal(error, 'unable to exit gracefully')
            setTimeout(() => process.exit(1), 1000)
        })
    })
}

if (module === require.main) {
    main().catch((error) => {
        logger.fatal(error, 'unable to start')
        setTimeout(() => process.exit(1), 1000)
    })
}
