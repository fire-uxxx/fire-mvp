import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import Stripe from 'stripe'
import admin from '../utils/firebase'
import { useRuntimeConfig } from '#imports' // Auto-imported in Nuxt 3

// Get runtime configuration (private and public)
const config = useRuntimeConfig()

// Use the secret key from the private part of the runtimeConfig
const stripeSecretKey = config.STRIPE_SECRET_KEY
console.log('Stripe Secret Key from runtime config:', stripeSecretKey)

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-02-24.acacia'
})

export default defineEventHandler(async event => {
  if (event.req.method !== 'POST') {
    setResponseStatus(event, 405)
    return { error: 'Method Not Allowed' }
  }

  try {
    const body = await readBody(event)
    const { userId, collection, product, amount } = body

    if (!userId || !collection || !product || !amount) {
      setResponseStatus(event, 400)
      return { error: 'Missing required parameters', received: body }
    }

    // Get the front-end URL from the public runtime config
    const frontendUrl =
      config.public.FRONTEND_URL || 'https://fallback-url.com/'

    // Create the Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: product },
            unit_amount: amount // in cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${frontendUrl}`,
      cancel_url: `${frontendUrl}`
    })

    console.log('Created Stripe session:', session)

    // Write a record to Firestore (if needed)
    const db = admin.firestore()
    await db.collection(collection).add({
      userId,
      product,
      amount, // store the raw amount (in cents)
      sessionId: session.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    })

    // Return the session id and URL for client redirection
    return {
      id: session.id,
      url: session.url
    }
  } catch (error) {
    setResponseStatus(event, 500)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
})
