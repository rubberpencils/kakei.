package app.kakie

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

/** Android 16 emulator: the first screen is onboarding, and local mode is one tap. */
class OnboardingTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun onboardingOffersLocalMode() {
        rule.onNodeWithText("Skip, keep it on this phone").assertIsDisplayed()
        rule.onNodeWithText("Create account").assertIsDisplayed()
    }
}
