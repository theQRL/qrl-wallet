module.exports = {
  servers: {
    one: {
      host: '35.176.222.237',
      username: 'ubuntu'
    }
  },
  app: {
    name: 'qrl-wallet',
    path: '../',
    servers: {
      one: {},
    },
    buildOptions: {
      serverOnly: true,
    },
    env: {
      ROOT_URL: 'https://wallet.theqrl.org',
      MONGO_URL: 'mongodb://localhost/meteor',
    },
    ssl: {
      autogenerate: {
        email: 'scott@theqrl.org',
        domains: 'wallet.theqrl.org'
      }
    },
    docker: {
      image: 'abernix/meteord:node-8.9.3-binbuild',
    },
    enableUploadProgressBar: true
  },
  mongo: {
    version: '3.4.1',
    servers: {
      one: {}
    }
  }
};
