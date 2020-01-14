import NodeWalletConnect from '@walletconnect/node'
import WalletConnectQRCodeModal from '@walletconnect/qrcode-modal'

const ProviderEngine = require('web3-provider-engine')
const FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js')
const NonceSubProvider = require('web3-provider-engine/subproviders/nonce-tracker.js')
const HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js')
const ProviderSubprovider = require('web3-provider-engine/subproviders/provider.js')

const ora = require('ora')

const singletonNonceSubProvider = new NonceSubProvider()

class WalletConnectProvider {
  private connector: NodeWalletConnect
  private engine: any

  constructor (
    provider: string,
    { bridge = 'https://bridge.walletconnect.org', shareNonce = true } = {}
  ) {
    this.connector = new NodeWalletConnect(
      { bridge },
      {
        clientMeta: {
          name: 'truffle-walletconnect-provider',
          description: 'WalletConnect Provider for Truffle',
          url: '#',
          icons: ['https://walletconnect.org/walletconnect-logo.png']
        }
      }
    )

    this.engine = new ProviderEngine()
    this.engine.addProvider(
      new HookedSubprovider({
        getAccounts: (cb: any) => this.getAccounts(cb),
        signTransaction: (txParams: any, cb: any) =>
          this.signTransaction(txParams, cb),
        signMessage: (message: any, cb: any) => this.signMessage(message, cb)
      })
    )
    this.engine.addProvider(
      shareNonce ? singletonNonceSubProvider : new NonceSubProvider()
    )
    this.engine.addProvider(new FiltersSubprovider())
    this.engine.addProvider(new ProviderSubprovider(provider))
    this.engine.start() // Required by the provider engine.
  }

  sendAsync () {
    this.engine.sendAsync.apply(this.engine, arguments)
  }

  send () {
    return this.engine.send.apply(this.engine, arguments)
  }

  sessionConnect () {
    return new Promise((resolve, reject) => {
      this.connector.on('connect', (error: any) => {
        if (error) {
          return reject(error)
        }
        WalletConnectQRCodeModal.close(true)

        resolve()
      })
    })
  }

  async getConnector () {
    if (this.connector.connected) {
      return this.connector
    }

    await this.connector.createSession()

    WalletConnectQRCodeModal.open(this.connector.uri, () => {}, true)

    const spinner = ora('Waiting for connection').start()
    await this.sessionConnect()
    spinner.succeed('Wallet connected')

    this.connector.on('disconnect', () => {
      this.engine.stop()
      throw new Error('The WalletConnect session has been disconnected')
    })

    return this.connector
  }

  getAccounts (cb: any) {
    this.getConnector()
      .then(connector => cb(null, connector.accounts))
      .catch(err => cb(err))
  }

  signTransaction (txParams: any, cb: any) {
    console.log('\n')
    const spinner = ora('Waiting for transaction to be signed').start()
    this.getConnector()
      .then(connector => connector.signTransaction(txParams))
      .then(result => {
        spinner.succeed('Transaction signed')
        console.log('\n')
        cb(null, result)
      })
      .catch(err => cb(err))
  }

  signMessage (message: any, cb: any) {
    console.log('\n')
    const spinner = ora('Waiting for transaction to be signed').start()
    this.getConnector()
      .then(connector => connector.signMessage([message.from, message.data]))
      .then(result => {
        spinner.succeed('Message signed')
        console.log('\n')
        cb(null, result)
      })
      .catch(err => cb(err))
  }
}

export default WalletConnectProvider
