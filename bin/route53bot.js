#!/usr/bin/env node
const bot = require('../src/index')

bot.createRecord()
  .then(
    x => {
      if (x) {
        console.log(`finished with change set:\n\t${JSON.stringify(x, null, 2)}`)
      } else {
        console.log('finished without changes')
      }
    },
    err => console.log('failed to check and update zone', err)
  )
