/**
 * @file InfluxDB stats collector
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as config from 'config'
import {InfluxDB, IPoint} from 'influx'
import {JsonRpcAuthMethodContext as JCtx} from '@steemit/koa-jsonrpc'

import {BatchWriter} from './batch-writer'
import {logger as baseLogger} from './logger'
import {normalizeUrl} from './utils'

export const db = new InfluxDB(config.get('influxdb_url'))

const logger = baseLogger.child({module: 'batch-writer'})
export const writer = new BatchWriter<IPoint>()

writer.addTransport({
    name: 'influxdb',
    interval: 1000,
    maxItems: 2000,
    write: async (data) => {
        // consolidate pageviews
        const points: IPoint[] = []
        const pageviews: {[page: string]: IPoint} = {}
        for (const point of data) {
            if (point.measurement === 'pageview' && point.fields && point.tags) {
                const key = `${ point.fields.page }-${ point.tags.type }`
                if (pageviews[key]) {
                    (<any>pageviews[key]).fields.views += point.fields.views
                    continue
                } else {
                    pageviews[key] = point
                }
            }
            points.push(point)
        }
        // write points to db
        await db.writePoints(points, {precision: 'ms'})
    }
})

writer.on('error', (error) => {
    logger.error(error, 'writer error')
})

writer.on('flush', (transport, points) => {
    logger.info({transport, points}, 'writer flushed')
})

/**
 * Collect data.
 * @param event  Event name, used as influx measurement.
 * @param data  Event payload.
 */
export async function collect(this: JCtx, event: string, data: any) {
    this.assert(typeof event === 'string', 'invalid event name')
    let type = this.account ? 'signed' : 'public'
    const timestamp = Date.now().toString()
    switch (event) {
        case 'pageview': {
            let {page} = data
            this.assert(typeof page === 'string', 'invalid page')
            let fields: any = {
                views: 1,
                page: normalizeUrl(page),
            }
            writer.write({
                timestamp,
                measurement: 'pageview',
                fields,
                tags: {type}
            })
            break
        }
        case 'signup': {
            const {step, uid} = data
            this.assert(typeof step === 'string', 'invalid step')
            this.assert(typeof uid === 'string', 'invalid uid')
            writer.write({
                timestamp,
                measurement: 'signup',
                fields: {step},
                tags: {type, uid}
            })
            break
        }
        default:
            this.assert(false, 'unknown event')
    }
}
