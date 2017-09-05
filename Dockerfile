FROM node:8

# yarn > npm
RUN npm install -g yarn

WORKDIR /var/app
RUN mkdir -p /var/app
ADD package.json /var/app/package.json
ADD yarn.lock /var/app/yarn.lock
RUN yarn install

COPY . /var/app

RUN yarn run test

ENV PORT 8090
ENV NODE_ENV production

EXPOSE 8090

CMD [ "yarn", "start" ]
