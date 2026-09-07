package com.example

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

    setContent {
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(ComposeColor(0xFF020410))
          .testTag("game_screen")
      ) {
        GameWebView()
      }
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GameWebView() {
  val context = LocalContext.current
  val webView = remember {
    WebView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      setBackgroundColor(Color.parseColor("#020410"))
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      overScrollMode = View.OVER_SCROLL_NEVER
      setLayerType(View.LAYER_TYPE_HARDWARE, null)

      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = true
        allowContentAccess = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        useWideViewPort = true
        loadWithOverviewMode = true
        cacheMode = WebSettings.LOAD_DEFAULT
        mediaPlaybackRequiresUserGesture = false
      }

      webViewClient = object : WebViewClient() {}
      webChromeClient = WebChromeClient()

      loadUrl("file:///android_asset/index.html")
    }
  }

  DisposableEffect(webView) {
    onDispose {
      webView.destroy()
    }
  }

  BackHandler {
    webView.evaluateJavascript(
      "(function() { " +
      "  var settings = document.getElementById('settings-screen');" +
      "  var gameOver = document.getElementById('game-over-screen');" +
      "  if (settings && settings.classList.contains('active')) {" +
      "    document.getElementById('btn-settings-back').click();" +
      "    return 'handled';" +
      "  } else if (gameOver && gameOver.classList.contains('active')) {" +
      "    document.getElementById('btn-game-over-menu').click();" +
      "    return 'handled';" +
      "  }" +
      "  return 'exit';" +
      "})();"
    ) { result ->
      if (result == "\"exit\"" || result == null) {
        (context as? ComponentActivity)?.finish()
      }
    }
  }

  AndroidView(
    factory = { webView },
    modifier = Modifier
      .fillMaxSize()
      .testTag("canvas_game_view")
  )
}

