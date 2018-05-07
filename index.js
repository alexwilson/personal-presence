#!/usr/bin/env node
const AWS = require('aws-sdk')
const fetch = require('node-fetch')
const handlebars = require('handlebars')
const path = require('path')
const fs = require('fs')

const withEnhancedLocation = data => new Promise((resolve, reject) => {
    const params = [
        'format=jsonv2'
    ]

    switch (data.type) {
        case 'place':
            Object.keys(data.place.location).map(key => params.push(`${key}=${data.place.location[key]}`))
            return fetch(`https://nominatim.openstreetmap.org/reverse?${params.join('&')}`, {
                'headers': {
                    'User-Agent': 'A Friendly Robot'
                }
            })
            .then(res => res.json())
            .then(res => {
                data.place.location = res
                return resolve(data)
            })

        default:
            return resolve(data)
    }
})

const withNamedLocation = data => {
    switch (data.type) {
        case 'place':
            switch (data.place.id) {

                case 572651705:
                    data.place.name = 'Home'
                    data.label = 'at home'
                    break

                case 593875351:
                    data.place.name = 'Work'
                    data.label = 'at work'
                    break

                default:
                    data.place.name = data.place.location.address.city
                    data.label = `in ${data.place.location.address.city}, ${data.place.location.address.country}`
                    break
            }
    }
    return data
}

const toSingleLocation = (previousActivity, activity) => {
    if (previousActivity) {

        // We've already got some place data.
        if (previousActivity.place) return previousActivity
        return Object.assign({}, previousActivity, activity)
    }
    return activity
}

const figureItOut = _ => (
    fetch(`https://api.moves-app.com/api/1.1/user/storyline/daily?pastDays=2`, {
        headers: {
            'Authorization': `Bearer ${process.env.MOVES_AUTHORIZATION_TOKEN}`
        }
    })
    .then(res => res.json())

    // Merge data into a single array.
    .then(dates => dates.reduce((data, date) => date.segments.map(segment => data.push(segment)) ? data:data, []))

    // Enrich with OSM Location data where we can.
    .then(activities => Promise.all(activities.map(withEnhancedLocation)))

    // Enrich with known locations.
    .then(activities => activities.map(withNamedLocation))

    // Reduce to a single activity with a location.
    .then(activities => activities.reduce(toSingleLocation))
)

const toActivity = lastActivity => {
    const data = {}
    data.label = `Alex is ${lastActivity.label}`
    return data
}

const toHtmlPage = data => {
    const view = path.resolve(__dirname, "./views/index.html")
    const template = handlebars.compile(fs.readFileSync(view, "utf8"))
    return template(data)
}

const refreshState = event => {
    const s3 = new AWS.S3()
    return figureItOut()
        .then(toActivity)
        .then(toHtmlPage)
        .then(string => new Buffer(string))
        .then(buffer => s3.putObject({
            Bucket: process.env.BUCKET,
            Key: 'index.html',
            CacheControl: 'public, max-age=900',
            ContentDisposition: 'inline',        
            ContentType: 'text/html',
            Body: buffer,
          }).promise()
        )
        .then(console.log)
        .catch(console.error)
}


module.exports = { refreshState };