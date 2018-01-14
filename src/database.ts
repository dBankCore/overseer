/**
 * @file InfluxDB helpers.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as config from 'config'
import {InfluxDB} from 'influx'

export const db = new InfluxDB(config.get('influxdb_url'))

/**
 * Create InfluxDB database if it does not exist.
 */
export async function ensureDatabase(instance: any) {
    const {options} = instance
    if (!options.database) {
        throw new Error('InfluxDB database name not set')
    }
    const names = await instance.getDatabaseNames()
    if (!names.includes(options.database)) {
        await instance.createDatabase(options.database)
    }
}
