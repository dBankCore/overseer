FROM node:8-alpine

RUN apk add --no-cache make bash git
RUN npm install -g yarn

WORKDIR /app
COPY . .

RUN make ci-test
RUN make lib

# prune modules
RUN yarn install --production --non-interactive

EXPOSE 8080

ENV PORT 8080
ENV NODE_ENV production

CMD [ "node", "lib/server.js" ]
