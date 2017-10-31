# k8s-route53bot

Creates DNS records in an AWS Route53 zone for every loadBalancer service found in a kubernetes cluster.

## Purpose

This exists to dynamically create records under an AWS Route 53 Zone for all loadbalancer service IPs in a Kubernetes cluster pointed to a subdomain.

The repository contains both a 1 time job and a cron job so that after the initial creation, it will check, add/update the record as needed every 6 minutes (the length of the default record TTL).

## AWS Access

This requires access to AWS via an AWS Account Id and Secret key. These should map to an IAM account that only has access to Route53 Zones and Records to list, create and edit capabilities.

I *strongly recommend against* using an account with delete permissions or broader access. As it's a job that runs temporarily, it's a difficult target to hit, but least privilege for the win.

## Install

Intended for use as a Kubernetes job/cron job. It can be deployed using [hikaru](https://github.com/arobson/hikaru) in order to create both for you:

```
hikaru deploy git://github.com/arobson/k8s-route53bot \
 -k {kubernetes url} \
 -u {username} \
 -p {password} \
```

You will be prompted for the following set of information:
 * `namespace` - the kubernetes namespace to install the jobs in
 * `zone` - the name of the parent zone (ex: `test.io`)
 * `domains` - the comma delimited domains to create the record for (ex: `me.test.io,test.io`)
 * `aws-account` - the account id for the IAM account
 * `aws-secret` - the account secret key for the IAM account

You may also choose to supply a key/value file as JSON, YAML or TOML using a `-f` argument with a path to the file.

## Custom Use

You can also choose to copy the [mcgonagall](https://github.com/npm/mcgonagall) specifications into your own cluster spec but you will likely want to replace some of the tokens in this case.