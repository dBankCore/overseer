FROM node:8

# yarn > npm
RUN npm install -g yarn

WORKDIR /var/app
RUN mkdir -p /var/app
ADD package.json /var/app/package.json
RUN yarn

COPY . /var/app

RUN yarn run test && yarn run build

ENV PORT 8080
ENV NODE_ENV production

EXPOSE 8080

CMD [ "yarn", "run", "production" ]
