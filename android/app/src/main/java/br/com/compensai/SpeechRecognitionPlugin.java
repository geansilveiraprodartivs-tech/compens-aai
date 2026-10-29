package br.com.compensai;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Reconhecimento de voz nativo (pt-BR) para o app Android.
 *
 * Por que existe: a Web Speech API NÃO está disponível no WebView do Android
 * (o Chromium nunca habilitou o reconhecimento lá). Sem isso, o botão
 * "Por voz" só funcionaria no navegador. Este plugin usa o SpeechRecognizer
 * do próprio aparelho (Google/serviço de voz instalado) — sem custo, sem
 * credenciais e sem serviço pago.
 *
 * Permissão: o Android exige RECORD_AUDIO em tempo de execução (diálogo do
 * sistema). Ele é pedido uma única vez, na primeira vez que o usuário toca no
 * microfone; depois disso o sistema lembra a escolha e não pergunta mais.
 */
@CapacitorPlugin(
        name = "SpeechRecognition",
        permissions = {
                @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
        }
)
public class SpeechRecognitionPlugin extends Plugin implements RecognitionListener {

    private SpeechRecognizer recognizer;
    private boolean listening = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    /** Informa se o aparelho tem um serviço de reconhecimento de voz utilizável. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available;
        try {
            available = SpeechRecognizer.isRecognitionAvailable(getContext());
        } catch (Exception e) {
            available = false;
        }
        ret.put("available", available);
        ret.put("permission", getPermissionState("microphone").toString());
        call.resolve(ret);
    }

    /** Inicia a captura. Pede a permissão do microfone na primeira vez. */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneCallback");
            return;
        }
        beginRecognition(call);
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginRecognition(call);
        } else {
            call.reject("Permissão do microfone negada pelo usuário", "not-allowed");
        }
    }

    private void beginRecognition(PluginCall call) {
        boolean hasService;
        try {
            hasService = SpeechRecognizer.isRecognitionAvailable(getContext());
        } catch (Exception e) {
            hasService = false;
        }
        if (!hasService) {
            call.reject("Reconhecimento de voz não disponível neste aparelho", "unavailable");
            return;
        }

        final String language = call.getString("language", "pt-BR");
        getActivity().runOnUiThread(() -> {
            try {
                destroyRecognizer();

                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(SpeechRecognitionPlugin.this);

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 2);
                intent.putExtra(
                        RecognizerIntent.EXTRA_CALLING_PACKAGE,
                        getContext().getPackageName());

                listening = true;
                recognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                listening = false;
                destroyRecognizer();
                call.reject("Não foi possível iniciar o microfone", "start-failed", e);
            }
        });
    }

    /** Encerra a captura mantendo o que já foi reconhecido. */
    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null && listening) {
                listening = false;
                try {
                    recognizer.stopListening();
                } catch (Exception ignored) {
                    // serviço já encerrado
                }
            }
        });
        call.resolve();
    }

    /** Cancela a captura descartando o áudio atual. */
    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            listening = false;
            if (recognizer != null) {
                try {
                    recognizer.cancel();
                } catch (Exception ignored) {
                    // serviço já encerrado
                }
            }
            destroyRecognizer();
        });
        call.resolve();
    }

    /** Abre as configurações do app para o usuário liberar o microfone. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir as configurações", "settings-failed", e);
        }
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.destroy();
            } catch (Exception ignored) {
                // nada a fazer
            }
            recognizer = null;
        }
    }

    private void emit(String event, String key, String value) {
        JSObject data = new JSObject();
        data.put(key, value);
        notifyListeners(event, data);
    }

    private void emitEnd() {
        notifyListeners("end", new JSObject());
    }

    private static String mapError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no-speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "network";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "busy";
            default:
                return "unknown";
        }
    }

    // ---------------------------------------------------------------- eventos

    @Override
    public void onReadyForSpeech(Bundle params) {
        emit("start", "ok", "1");
    }

    @Override
    public void onBeginningOfSpeech() {
        // silêncio inicial: nada a fazer
    }

    @Override
    public void onRmsChanged(float rmsdB) {
        // nível do áudio: não usado
    }

    @Override
    public void onBufferReceived(byte[] buffer) {
        // áudio bruto: não usado
    }

    @Override
    public void onEndOfSpeech() {
        // o resultado final chega em onResults
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        ArrayList<String> matches =
                partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches != null && !matches.isEmpty()) {
            emit("partial", "transcript", matches.get(0));
        }
    }

    @Override
    public void onResults(Bundle results) {
        ArrayList<String> matches =
                results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
        listening = false;
        if (!text.isEmpty()) {
            emit("final", "transcript", text);
        }
        emitEnd();
        main.post(this::destroyRecognizer);
    }

    @Override
    public void onError(int error) {
        listening = false;
        emit("error", "code", mapError(error));
        emitEnd();
        main.post(this::destroyRecognizer);
    }

    @Override
    public void onEvent(int eventType, Bundle params) {
        // eventos internos do serviço: não usados
    }

    @Override
    protected void handleOnDestroy() {
        listening = false;
        destroyRecognizer();
        super.handleOnDestroy();
    }
}
