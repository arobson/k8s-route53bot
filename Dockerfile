FROM node:8-alpine

MAINTAINER "Alex Robson <asrobson@gmail.com>"

RUN npm i @npm-wharf/k8s-route53bot@1.1.2 -g

CMD route53bot