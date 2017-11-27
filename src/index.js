const _ = require('lodash')
const hikaru = require('@npm-wharf/hikaru')
const Route53 = require('nice-route53')
const Promise = require('bluebird')

const router = new Route53({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY
})
const ZONE_NAME = process.env.AWS_ZONE_NAME
const DOMAIN_NAMES = process.env.AWS_DOMAIN_NAMES

function createRecord () {
  console.log(`connecting to kubernetes at ${process.env.K8S_URL}`)
  return hikaru.connect()
    .then(
      onConnected,
      onFailed
    )
}

function findZone () {
  return new Promise((resolve, reject) => {
    router.zones((err, zones) => {
      if (err) {
        console.log('an error occurred trying to look up the zone', err)
        reject(err)
      } else {
        const zone = _.find(zones, {name: ZONE_NAME})
        if (zone) {
          console.log(`  found zone '${ZONE_NAME} with id: '${zone.zoneId}'`)
          resolve(zone.zoneId)
        } else {
          reject(new Error(`No zone named ${ZONE_NAME} found`))
        }
      }
    })
  })
}

function findRecord (zoneId, domain) {
  return new Promise((resolve, reject) => {
    console.log(`looking up records in zone '${zoneId}'`)
    router.records(zoneId, (err, records) => {
      if (err) {
        console.log('an error occurred looking up records in the zone', err)
        reject(err)
      } else {
        console.log(`  checking ${records.length} records for '${domain}'`)
        const pattern = domain.replace('*', '\\052')
        const record = _.find(records, {name: pattern})
        if (record) {
          console.log('  matching record found')
          resolve(record)
        } else {
          console.log('  no matching record found')
          resolve(undefined)
        }
      }
    })
  })
}

function onConnected () {
  return findZone()
    .then(onZoneId)
}

function onFailed (err) {
  console.log(`Could not connect to kubernetes ${process.env.K8S_URL}:\n\t${err.message}`)
  throw err
}

function onRecord (zoneId, domain, record) {
  console.log(`looking up LoadBalacners in kubernetes`)
  return hikaru.k8s.getLoadBalancers()
    .then(
      lbs => {
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
          }, {ips: []})
          console.log(`    with ${set.ips.length} IPs`)
          return setupRoute(zoneId, domain, record, set)
        } else {
          console.log(`    no services marked as loadbalancers were found, checking again in 5 seconds`)
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              return onRecord(zoneId, domain, record)
                .then(resolve, reject)
            }, 5000)
          })
        }
      }
    )
}

function onZoneId (zoneId) {
  const domains = DOMAIN_NAMES.split(',').map(x => x.trim())
  const changes = domains.map(domain => {
    return findRecord(zoneId, domain)
      .then(
        record => {
          return onRecord(zoneId, domain, record)
        }
      )
  })
  return Promise.all(changes)
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
    if (_.every(set.ips.map(ip => record.values.includes(ip)))) {
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

function upsertRecord (record) {
  return new Promise((resolve, reject) => {
    router.upsertRecord(record, (err, res) => {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    })
  })
}

module.exports = {
  createRecord: createRecord
}
