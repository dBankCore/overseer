/**
 * @file Statistics endpoints.
 * @author Johan Nordberg <johan@steemit.com>
 */

import {JsonRpcAuthMethodContext as JCtx} from '@steemit/koa-jsonrpc'
import * as config from 'config'
import {escape, InfluxDB, IPoint} from 'influx'

import {db} from './database'
import {normalizeUrl} from './utils'

export async function getPageviews(this: JCtx, page: string) {
    this.assert(typeof page === 'string', 'invalid page')
    page = normalizeUrl(page)
    const result = await db.query<{views: number}>(`
        SELECT sum(views) as views FROM pageview
        WHERE page = ${ escape.stringLit(page) } AND time > now() - 30d
        GROUP BY time(1d)
        FILL(0)
    `)
    return {
        '30d': result.map((v) => v.views),
        // TODO: get total from redis
        'total': result.reduce((p, n) => p + n.views, 0),
    }
}
