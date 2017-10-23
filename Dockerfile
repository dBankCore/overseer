FROM node:8-alpine

ARG SOURCE_COMMIT
ENV SOURCE_COMMIT ${SOURCE_COMMIT}
ARG DOCKER_TAG
ENV DOCKER_TAG ${DOCKER_TAG}

RUN apk add --no-cache make bash git
RUN npm install -g yarn

# use bash as the default shell, the busybox shell does not work with ypib
RUN cp /bin/bash /bin/sh

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
