package app.kakie.lib

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

data class Plan(val id: String, val title: String, val price: String, val trial: String?, val offerToken: String?)

class Billing(context: Context, private val activity: () -> Activity?) : PurchasesUpdatedListener {
    private val skus = listOf("kakei_pro_monthly", "kakei_pro_yearly")
    private val details = mutableMapOf<String, ProductDetails>()
    var onPurchase: ((token: String, productId: String) -> Unit)? = null
    private val client: BillingClient = BillingClient.newBuilder(context.applicationContext)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    suspend fun connect(): Boolean = suspendCancellableCoroutine { cont ->
        if (client.isReady) {
            cont.resume(true)
            return@suspendCancellableCoroutine
        }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (cont.isActive) cont.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
            }
            override fun onBillingServiceDisconnected() {}
        })
    }

    suspend fun plans(): List<Plan> {
        if (!connect()) return emptyList()
        val products = skus.map {
            QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.SUBS).build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        return suspendCancellableCoroutine { cont ->
            client.queryProductDetailsAsync(params) { result, list ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    if (cont.isActive) cont.resume(emptyList())
                    return@queryProductDetailsAsync
                }
                details.clear()
                val plans = list.map { d ->
                    details[d.productId] = d
                    val offers = d.subscriptionOfferDetails.orEmpty()
                    val paid = offers.firstOrNull { it.pricingPhases.pricingPhaseList.any { p -> p.priceAmountMicros > 0 } } ?: offers.firstOrNull()
                    val trial = offers.any { it.pricingPhases.pricingPhaseList.any { p -> p.priceAmountMicros == 0L } }
                    Plan(
                        d.productId,
                        if (d.productId == "kakei_pro_yearly") "Yearly" else "Monthly",
                        paid?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice ?: "",
                        if (trial) "Includes a free trial" else null,
                        paid?.offerToken,
                    )
                }
                if (cont.isActive) cont.resume(plans)
            }
        }
    }

    fun buy(plan: Plan) {
        val act = activity() ?: return
        val detail = details[plan.id] ?: return
        val token = plan.offerToken ?: return
        val flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).setOfferToken(token).build(),
        )).build()
        client.launchBillingFlow(act, flow)
    }

    suspend fun owned(): Pair<String, String>? {
        if (!connect()) return null
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        return suspendCancellableCoroutine { cont ->
            client.queryPurchasesAsync(params) { _, purchases ->
                val mine = purchases.firstOrNull { it.purchaseState == Purchase.PurchaseState.PURCHASED && it.products.any { p -> p in skus } }
                val id = mine?.products?.firstOrNull { it in skus }
                if (cont.isActive) cont.resume(if (mine != null && id != null) mine.purchaseToken to id else null)
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode != BillingClient.BillingResponseCode.OK) return
        val mine = purchases?.firstOrNull { it.purchaseState == Purchase.PurchaseState.PURCHASED } ?: return
        val id = mine.products.firstOrNull { it in skus } ?: return
        onPurchase?.invoke(mine.purchaseToken, id)
    }
}
