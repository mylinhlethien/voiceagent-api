FROM node:12-alpine

RUN apk --no-cache add \
      bash \
      g++ \
      ca-certificates \
      lz4-dev \
      musl-dev \
      cyrus-sasl-dev \
      openssl-dev \
      make \
      python

RUN apk add --no-cache --virtual .build-deps gcc zlib-dev libc-dev bsd-compat-headers py-setuptools bash

RUN mkdir /app
WORKDIR /app

COPY package.json /app
COPY index.js /app

ENV CPPFLAGS -I/usr/local/opt/openssl/include
ENV LDFLAGS -L/usr/local/opt/openssl/lib

# Bundle app source
COPY . .

RUN cd /app; npm install
# Install node-rdkafka seperately 
#RUN cd /app; npm install node-rdkafka --no-package-lock

ENV NODE_ENV production
ENV PORT 8080
EXPOSE 8080

CMD [ "npm", "start" ]
