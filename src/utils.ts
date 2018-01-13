import {parse as parseUrl} from 'url'

/** Deep copy JSON serializable value */
export function copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
}

/** Parse boolean value from string */
export function parseBool(input: any): boolean {
    if (typeof input === 'string') {
        input = input.toLowerCase().trim()
    }
    switch (input) {
        case true:
        case 1:
        case '1':
        case 'y':
        case 'yes':
        case 'on':
            return true
        case 0:
        case false:
        case '0':
        case 'n':
        case 'no':
        case 'off':
            return false
        default:
            throw new Error(`Ambiguous boolean: ${ input }`)
    }
}

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

/**
 * Normalize an url.
 * @returns normalized path component of url.
 */
export function normalizeUrl(url: string) {
    const {path} = parseUrl(url)
    if (!path || path.length === 0) {
        return '/'
    }
    return path
}
