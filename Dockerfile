FROM node:8-alpine

MAINTAINER "Alex Robson <asrobson@gmail.com>"

RUN npm i k8s-route53bot -g

CMD route53bot