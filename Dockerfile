FROM mhart/alpine-node:8

WORKDIR /app
COPY package.json package-lock.json ./

RUN apk add --no-cache make bash
RUN npm install

COPY . .

ARG RAKAM_TEST_ENDPOINT
ENV RAKAM_TEST_ENDPOINT ${RAKAM_TEST_ENDPOINT}

ARG RAKAM_TEST_KEY
ENV RAKAM_TEST_KEY ${RAKAM_TEST_KEY}

RUN npm test
RUN make lib

RUN rm -r node_modules && npm install --production

# --

FROM mhart/alpine-node:base-8

WORKDIR /app
COPY --from=0 /app .

EXPOSE 8080

ENV PORT 8080
ENV NODE_ENV production

CMD [ "node", "lib/server.js" ]
