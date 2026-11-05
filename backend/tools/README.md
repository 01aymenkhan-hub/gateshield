# Offline Urdu-to-English name model

Runtime uses **AI4Bharat IndicXlit v1.0 indic-en**, MIT licensed, exported to
ONNX. This is name transliteration, not semantic translation. It does not
recover a person's official preferred English spelling from an Urdu-only card.
The general name-token dictionary in `app/parser.py` supplies conventional
spellings; unknown words use the model with conservative phonetic alignment.
No whole-person identities, CNIC numbers or dates are used for conversion.

Source: https://github.com/AI4Bharat/IndicXlit

Official archive:
https://github.com/AI4Bharat/IndicXlit/releases/download/v1.0/indicxlit-indic-en-v1.0.zip

Archive SHA256: `420d23a13cfa953edfb47644bc805de06e97134f25e6d182303a29f55b5a3322`.
Keep the license at `backend/third_party/IndicXlit-LICENSE.txt` with distributed weights.

For a reproducible export in an **isolated research environment** with Torch,
ONNX and ONNX Runtime installed:

1. Verify the official archive's SHA256 before extracting.
2. Put extracted `corpus-bin` and `transformer` under `WORK/indic-model/`.
3. Place the official `model_training_scripts/lang_list.txt` in `WORK/lang_list.txt`.
4. Run `python backend/tools/export_indicxlit.py --model-root WORK --output OUTPUT`.
5. The exporter checks encoder/decoder logits against Torch for three numeric
   inputs, including variable length and batch size. No identity images needed.
6. Provision the output read-only for the application and set
   `OCR_TRANSLITERATION_DIR` in `backend/.env` to its absolute path.

The application requires only its existing ONNX Runtime dependency, not Torch,
Fairseq or a second language-model service. The model is loaded lazily once;
token results are bounded in-memory cached. Missing/invalid assets preserve
the readable Urdu and ask for manual English entry. Runtime never downloads
weights or calls any external service.

The export helper implements the original six-layer pre-normalized
encoder/decoder, four attention heads, GELU, learned token embeddings and
Fairseq sinusoidal positions. It loads the released checkpoint with
`weights_only=True` and only the required `argparse.Namespace` allowlist.
