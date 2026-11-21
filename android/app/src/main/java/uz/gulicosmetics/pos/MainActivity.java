package uz.gulicosmetics.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintManager;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

/**
 * Guli POS for Android: a full-screen browser locked to the live POS site.
 * Adds what a plain browser tab lacks: camera access for the barcode scanner,
 * photo upload, printing (window.print → Android print dialog) and a back button that walks page history.
 */
public class MainActivity extends Activity {
  private static final int REQ_CAMERA = 1;
  private static final int REQ_FILE = 2;

  private WebView web;
  private String appHost;
  private PermissionRequest pendingCamera;
  private ValueCallback<Uri[]> pendingFiles;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    appHost = Uri.parse(BuildConfig.APP_URL).getHost();

    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(0xFFFFFFFF);
    web = new WebView(this);
    root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(root);
    keepClearOfSystemBars(root);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(true);
    s.setUserAgentString(s.getUserAgentString() + " GuliPOSAndroid/" + BuildConfig.VERSION_NAME);

    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    cookies.setAcceptThirdPartyCookies(web, false);

    web.addJavascriptInterface(new Bridge(), "GuliAndroid");
    web.setWebViewClient(new Client());
    web.setWebChromeClient(new Chrome());

    if (Build.VERSION.SDK_INT >= 33) {
      getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
    }

    if (savedInstanceState != null) web.restoreState(savedInstanceState);
    else web.loadUrl(BuildConfig.APP_URL);
  }

  /** Android 15+ draws apps under the status and navigation bars; pad the page so nothing hides behind them or the keyboard. */
  private void keepClearOfSystemBars(View root) {
    if (Build.VERSION.SDK_INT < 30) return;
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return WindowInsets.CONSUMED;
    });
  }

  private void goBack() {
    if (web.canGoBack()) web.goBack();
    else finish();
  }

  @SuppressWarnings("deprecation")
  @Override
  public void onBackPressed() {
    goBack();
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    web.saveState(outState);
  }

  @Override
  protected void onPause() {
    super.onPause();
    CookieManager.getInstance().flush();
  }

  private boolean isAppUrl(Uri uri) {
    return "https".equals(uri.getScheme()) && appHost.equalsIgnoreCase(uri.getHost());
  }

  private class Client extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      Uri uri = request.getUrl();
      if (isAppUrl(uri)) return false;
      // Telegram, phone, maps and other outside links open in their own apps.
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
      } catch (ActivityNotFoundException ignored) {
        // Nothing can open it; stay on the page.
      }
      return true;
    }

    @Override
    public void onPageFinished(WebView view, String url) {
      // The site prints order sheets with window.print(), which a WebView ignores; route it to Android printing.
      view.evaluateJavascript("window.print=function(){GuliAndroid.print(document.title||'Guli')};", null);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
      if (!request.isForMainFrame()) return;
      String retry = BuildConfig.APP_URL.replace("'", "");
      view.loadDataWithBaseURL(null,
        "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
          + "<body style='font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;margin:0;text-align:center;color:#111'>"
          + "<p style='font-size:18px;font-weight:700'>Internet yoʻq</p>"
          + "<p style='color:#666'>Ulanishni tekshiring va qayta urinib koʻring.</p>"
          + "<button style='font-size:16px;font-weight:700;padding:12px 24px;border:1.5px solid #111;border-radius:8px;background:#e8d9c4' "
          + "onclick=\"location.href='" + retry + "'\">Qayta urinish</button></body></html>",
        "text/html", "utf-8", null);
    }
  }

  private class Chrome extends WebChromeClient {
    @Override
    public void onPermissionRequest(PermissionRequest request) {
      runOnUiThread(() -> {
        boolean wantsCamera = false;
        for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
        if (!wantsCamera || !isAppUrl(request.getOrigin())) {
          request.deny();
          return;
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
          request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
          if (pendingCamera != null) pendingCamera.deny();
          pendingCamera = request;
          requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA);
        }
      });
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
      if (pendingFiles != null) pendingFiles.onReceiveValue(null);
      pendingFiles = callback;
      try {
        startActivityForResult(params.createIntent(), REQ_FILE);
      } catch (ActivityNotFoundException e) {
        pendingFiles = null;
        return false;
      }
      return true;
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(requestCode, permissions, results);
    if (requestCode != REQ_CAMERA || pendingCamera == null) return;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
      pendingCamera.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
    } else {
      pendingCamera.deny();
      Toast.makeText(this, R.string.camera_denied, Toast.LENGTH_LONG).show();
    }
    pendingCamera = null;
  }

  @SuppressWarnings("deprecation")
  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != REQ_FILE || pendingFiles == null) return;
    pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
    pendingFiles = null;
  }

  /** Called from page JavaScript. */
  private class Bridge {
    @JavascriptInterface
    public void print(String title) {
      runOnUiThread(() -> {
        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
        String job = title == null || title.isEmpty() ? "Guli" : title;
        pm.print(job, web.createPrintDocumentAdapter(job), null);
      });
    }
  }
}
