require('dotenv').config()
const util = require('util')
const hikaru = require('@npm-wharf/hikaru')
const Route53 = require('nice-route53')

const router = new Route53({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY
})
const ZONE_NAME = process.env.AWS_ZONE_NAME
const DOMAIN_NAMES = process.env.AWS_DOMAIN_NAMES

const upsertRecord = util.promisify(router.upsertRecord.bind(router))
const listZones = util.promisify(router.zones.bind(router))
const listRecords = util.promisify(router.records.bind(router))

async function createRecord () {
  console.log(`connecting to kubernetes at ${process.env.K8S_URL}`)
  await hikaru.connect().catch(err => {
    console.log(`Could not connect to kubernetes ${process.env.K8S_URL}:\n\t${err.message}`)
    throw err
  })

  const zoneId = await findZone()

  const domains = DOMAIN_NAMES.split(',').map(x => x.trim())
  const changes = domains.map(async domain => {
    const record = await findRecord(zoneId, domain)

    const set = await findLoadBalancerIPs(zoneId, domain, record)

    return setupRoute(zoneId, domain, record, set)
  })

  return Promise.all(changes)
}

async function findZone () {
  const zones = await listZones()
  const zone = zones.find(({ name }) => name === ZONE_NAME)
  if (zone) {
    console.log(`  found zone '${ZONE_NAME} with id: '${zone.zoneId}'`)
    return zone.zoneId
  } else {
    throw new Error(`No zone named ${ZONE_NAME} found`)
  }
}

async function findRecord (zoneId, domain) {
  console.log(`looking up records in zone '${zoneId}'`)
  const records = await listRecords(zoneId)

  console.log(`  checking ${records.length} records for '${domain}'`)
  const pattern = domain.replace('*', '\\052')
  const record = records.find(({ name }) => name === pattern)
  if (record) {
    console.log('  matching record found')
    return record
  } else {
    console.log('  no matching record found')
  }
}

async function findLoadBalancerIPs (zoneId, domain, record) {
  console.log(`looking up LoadBalacners in kubernetes`)
  const lbs = await hikaru.k8s.getLoadBalancers()
  if (lbs.length > 0) {
    console.log(`    found ${lbs.length} services marked as loadbalancers`)
    const set = lbs.reduce((acc, lb) => {
      const ips = lb.status.loadBalancer.ingress.map(i => i.ip)
      const id = [lb.metadata.name, lb.metadata.namespace].join('.')
      if (ips.length) {
        acc[id] = ips
        acc.ips = acc.ips.concat(ips)
      }
      return acc
    }, { ips: [] })
    console.log(`    with ${set.ips.length} IPs`)
  } else {
    console.log(`    no services marked as loadbalancers were found, checking again in 5 seconds`)
    await new Promise(resolve => setTimeout(resolve, 5000))
    return findLoadBalancerIPs(zoneId, domain, record)
  }
}

function setupRoute (zoneId, domain, record, set) {
  const newRecord = {
    zoneId: zoneId,
    name: domain,
    type: 'A',
    ttl: 300,
    values: set.ips
  }
  console.log(`loadbalancer ips:\n${JSON.stringify(set, null, 2)}`)
  if (record) {
    console.log(`checking zone record for'${domain}' for ${set.ips.length > 1 ? 'IPs' : 'IP'} ${set.ips.join(', ')}`)
    if (set.ips.every(ip => record.values.includes(ip))) {
      console.log(`  zone record is correct`)
      return Promise.resolve(newRecord)
    } else {
      console.log(`  updating zone record ...`)
      return upsertRecord(newRecord)
    }
  } else {
    console.log(`creating zone record for '${domain}' to ${set.ips.length > 1 ? 'IPs' : 'IP'} ${set.ips.join(', ')}`)
    return upsertRecord(newRecord)
  }
}

module.exports = {
  createRecord: createRecord
}
