/**
 * @file Rakam.io client.
 * @author Johan Nordberg <johan@steemit.com>
 */

import {jsonRequest} from './utils'

const API_VERSION = '3'
const PACKAGE_VERSION = require('../package').version as string
const USER_AGENT = `steemit-leek/${ PACKAGE_VERSION }`

interface RakamEventContext {
    /** Rakam API key. */
    api_key?: string
    /** Rakam API version. */
    api_version?: string
    /** Optional library information for statistics. */
    library?: any
    /** Upload timestamp, milliseconds. */
    upload_time?: number // int64
    /** Optional UUID for deduplication. */
    uuid?: string
    /** Optional checksum for verify the body content. */
    checksum?: string
}

interface RakamEvent {
    /** The collection of event (pageview, touch, click etc.) */
    collection: string
    /** API context. */
    api: RakamEventContext
    /** The properties of the event */
    properties: {[name: string]: any}
}

export default class Rakam {

    /**
     *  Create a new Rakam instance.
     *  @param apiEndpoint  The rakam server hostname, e.g. `app.rakam.io`.
     *  @param apiKey       The rakam servers write_key.
     */
    constructor(
        public readonly apiEndpoint: string,
        public readonly apiKey: string,
    ) {}

    /**
     *  Collect an event.
     *  @param collection  Collection name, e.g. pageview.
     *  @param properties  Event metadata.
     */
    public async collect(collection: string, properties: {[name: string]: any}) {
        const event: RakamEvent = {
            collection, properties, api: {
                api_key: this.apiKey,
                api_version: API_VERSION,
                upload_time: Date.now(),
            },
        }
        return this.send('/event/collect', event) as Promise<number>
    }

    private async send(path: string, data: any) {
        return jsonRequest({
            path, method: 'POST',
            host: this.apiEndpoint,
            headers: {'User-Agent': USER_AGENT},
            rejectUnauthorized: true,
        }, data)
    }

}
