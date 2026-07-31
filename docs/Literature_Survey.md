# Literature Survey

The research-gap entries are the team's own analysis.

## Paper 1: A Time Series is Worth 64 Words: Long-term Forecasting with Transformers (PatchTST) (2023)

- **Assigned to:** Piyush Sagar (24BIT0620)
- **Method:** Channel-independent Transformer using subseries patches as tokens; includes supervised and self-supervised variants.
- **Dataset/evaluation:** ETT, Electricity, Traffic, Weather, ILI and other standard long-horizon benchmarks.
- **Advantages:** Efficient long-context modeling; patching captures local patterns; strong multivariate forecasting accuracy.
- **Limitations:** Typically trained for a target dataset; no direct capacity-decision logic or calibrated operational safety buffer.
- **Project research gap:** Adapt patch representations to streaming metrics and evaluate whether forecast gains reduce SLA violations and cost.
- **Source:** https://openreview.net/forum?id=Jbdc0vTOcol

## Paper 2: One Fits All: Power General Time Series Analysis by Pretrained LM (2023)

- **Assigned to:** Piyush Sagar (24BIT0620)
- **Method:** Repurposes frozen pretrained language/image Transformers and fine-tunes limited components for forecasting, classification, and anomaly detection.
- **Dataset/evaluation:** Multiple public benchmarks covering forecasting, classification, anomaly detection, and few-shot learning.
- **Advantages:** Demonstrates transfer of generic pretrained representations across several time-series tasks.
- **Limitations:** Modality mismatch can add overhead; performance depends on adaptation choices; not designed for real-time autoscaling.
- **Project research gap:** Determine whether repurposed LMs justify their compute cost for short-horizon streaming capacity planning.
- **Source:** https://arxiv.org/abs/2302.11939

## Paper 3: Lag-Llama: Towards Foundation Models for Probabilistic Time Series Forecasting (2023)

- **Assigned to:** Piyush Sagar (24BIT0620)
- **Method:** Decoder-only Transformer using lag features as covariates to produce probabilistic univariate forecasts.
- **Dataset/evaluation:** A broad pretraining corpus and downstream forecasting datasets from multiple domains.
- **Advantages:** Probabilistic output; strong zero-shot behavior; fine-tuning works with limited target data.
- **Limitations:** Primarily univariate; limited native handling of rich cross-metric and event context; deployment cost must be tested.
- **Project research gap:** Extend probabilistic forecasting to multivariate streaming demand and convert distributions into capacity risk controls.
- **Source:** https://arxiv.org/abs/2310.08278

## Paper 4: TEMPO: Prompt-based Generative Pre-trained Transformer for Time Series Forecasting (2024)

- **Assigned to:** Piyush Sagar (24BIT0620)
- **Method:** Combines trend-seasonal-residual decomposition with learned prompts in a generative Transformer.
- **Dataset/evaluation:** Common forecasting benchmarks across energy, traffic, weather, exchange-rate, and health-related series.
- **Advantages:** Explicitly models temporal components; supports zero-shot distribution adaptation and multimodal inputs.
- **Limitations:** Prompt selection and decomposition add design complexity; operational calibration is not the main focus.
- **Project research gap:** Use event and workload prompts for streaming spikes and test robustness under abrupt distribution shifts.
- **Source:** https://arxiv.org/abs/2310.04948

## Paper 5: Time-LLM: Time Series Forecasting by Reprogramming Large Language Models (2024)

- **Assigned to:** Piyush Sagar (24BIT0620)
- **Method:** Reprograms time-series patches into the representation space of a frozen LLM using prototype-based alignment and prompt context.
- **Dataset/evaluation:** Standard long- and short-term forecasting datasets including electricity, traffic, weather, and ETT families.
- **Advantages:** Uses pretrained LLM knowledge without full retraining; flexible contextual prompting.
- **Limitations:** Large model footprint and inference latency may be excessive for frequent scaling decisions; confidence calibration is limited.
- **Project research gap:** Benchmark accuracy-per-cost and latency against native TSFMs for five-minute operational forecasts.
- **Source:** https://openreview.net/forum?id=Unb5CVPtae

## Paper 6: Chronos: Learning the Language of Time Series (2024)

- **Assigned to:** Chirayu Sahu (24BIT0622)
- **Method:** Scales and quantizes numeric values into tokens and trains T5-style models with cross-entropy to sample probabilistic futures.
- **Dataset/evaluation:** 42 public datasets plus synthetic Gaussian-process series.
- **Advantages:** Simple probabilistic framework; strong zero-shot performance; multiple model sizes.
- **Limitations:** Quantization may lose fine-grained magnitude information; original design is mainly univariate and generic.
- **Project research gap:** Assess calibration on bursty demand and combine multiple operational metrics and event context.
- **Source:** https://arxiv.org/abs/2403.07815

## Paper 7: A Decoder-only Foundation Model for Time-Series Forecasting (TimesFM) (2024)

- **Assigned to:** Chirayu Sahu (24BIT0622)
- **Method:** Patch-based decoder-only foundation model pretrained for direct multi-horizon forecasting.
- **Dataset/evaluation:** Large pretraining corpus reported at roughly 100 billion real-world time points plus public evaluation datasets.
- **Advantages:** Competitive zero-shot accuracy and practical direct forecasting; strong scaling behavior.
- **Limitations:** Native support for exogenous variables and uncertainty depends on version/configuration; hosted inference cost must be measured.
- **Project research gap:** Evaluate TimesFM on regional streaming demand and integrate quantile or ensemble uncertainty into provisioning.
- **Source:** https://proceedings.mlr.press/v235/das24c.html

## Paper 8: Unified Training of Universal Time Series Forecasting Transformers (Moirai) (2024)

- **Assigned to:** Chirayu Sahu (24BIT0622)
- **Method:** Masked encoder with multi-patch projections, any-variate attention, and mixture-distribution prediction.
- **Dataset/evaluation:** LOTSA: more than 27 billion observations across nine domains.
- **Advantages:** Handles varied frequencies, arbitrary numbers of variables, and probabilistic distributions; strong zero-shot results.
- **Limitations:** Model and preprocessing complexity can raise latency and operational cost; not evaluated as a scaling controller.
- **Project research gap:** Test multivariate forecast quality versus inference cost and connect mixture distributions to SLA-aware headroom.
- **Source:** https://proceedings.mlr.press/v235/woo24a.html

## Paper 9: MOMENT: A Family of Open Time-series Foundation Models (2024)

- **Assigned to:** Chirayu Sahu (24BIT0622)
- **Method:** Masked pretraining over the Time Series Pile for forecasting, classification, anomaly detection, and imputation.
- **Dataset/evaluation:** Large public Time Series Pile and a multi-task evaluation benchmark.
- **Advantages:** Open models and weights; broad task coverage; useful for shared representations and anomaly/drift support.
- **Limitations:** A general multi-task model may be heavier than a forecasting-only model and still requires deployment-specific calibration.
- **Project research gap:** Use one representation for demand forecasting plus anomaly/drift detection in a streaming operations pipeline.
- **Source:** https://arxiv.org/abs/2402.03885

## Paper 10: Timer: Generative Pre-trained Transformers Are Large Time Series Models (2024)

- **Assigned to:** Chirayu Sahu (24BIT0622)
- **Method:** GPT-style next-token pretraining after converting heterogeneous data into a single-series sequence format.
- **Dataset/evaluation:** Curated corpus containing up to one billion time points; evaluation includes forecasting, imputation, and anomaly detection.
- **Advantages:** Unified generative formulation; supports multiple tasks and flexible adaptation.
- **Limitations:** Autoregressive inference can accumulate error and increase latency for long horizons; generic tests do not prove scaling benefit.
- **Project research gap:** Measure error accumulation at operational horizons and compare direct versus autoregressive models for scaling.
- **Source:** https://arxiv.org/abs/2402.02368

## Paper 11: Tiny Time Mixers: Fast Pre-trained Models for Enhanced Zero/Few-Shot Forecasting (2024)

- **Assigned to:** Sujal Agarwal (24BIT0623)
- **Method:** Compact TSMixer-based model with adaptive patching, multi-resolution sampling, prefix tuning, and optional exogenous inputs.
- **Dataset/evaluation:** Public multivariate time-series datasets across diverse resolutions.
- **Advantages:** Approximately one-million-parameter class; CPU-friendly; reports strong zero/few-shot efficiency.
- **Limitations:** Smaller capacity may struggle with rare flash-crowd patterns; uncertainty output is not the central design.
- **Project research gap:** Determine whether a lightweight model delivers the best accuracy-latency-cost trade-off for frequent cloud inference.
- **Source:** https://arxiv.org/abs/2401.03955

## Paper 12: Time-MoE: Billion-Scale Time Series Foundation Models with Mixture of Experts (2025)

- **Assigned to:** Sujal Agarwal (24BIT0623)
- **Method:** Sparse mixture-of-experts decoder-only models that activate a subset of experts per token and support flexible contexts/horizons.
- **Dataset/evaluation:** Time-300B: more than 300 billion time points across over nine domains.
- **Advantages:** High model capacity with lower activated compute than dense models; demonstrates time-series scaling laws.
- **Limitations:** Large checkpoints remain demanding to host and fine-tune; operational benefit may not offset cost for small teams.
- **Project research gap:** Compare large sparse models with tiny models under a strict cloud inference budget and latency target.
- **Source:** https://arxiv.org/abs/2409.16040

## Paper 13: UniTS: A Unified Multi-Task Time Series Model (2024)

- **Assigned to:** Sujal Agarwal (24BIT0623)
- **Method:** Task tokenization, time/variable attention, dynamic linear operators, and masked reconstruction for shared multi-task learning.
- **Dataset/evaluation:** 38 datasets across human activity, healthcare, engineering, finance, and forecasting domains.
- **Advantages:** One shared model supports forecasting, imputation, anomaly detection, and classification with few/zero-shot capability.
- **Limitations:** Multi-task scope increases complexity; specialization and probability calibration for demand forecasting may be weaker.
- **Project research gap:** Combine forecast, imputation, and anomaly detection while preserving reliable capacity decisions under missing telemetry.
- **Source:** https://proceedings.neurips.cc/paper_files/paper/2024/file/fe248e22b241ae5a9adf11493c8c12bc-Paper-Conference.pdf

## Paper 14: Forecasting Workload in Cloud Computing: Uncertainty-Aware Predictions and Transfer Learning (2023)

- **Assigned to:** Sujal Agarwal (24BIT0623)
- **Method:** Bayesian deep-learning models provide workload forecasts and predictive uncertainty; tests transfer across providers.
- **Dataset/evaluation:** Google and Alibaba cluster workload traces.
- **Advantages:** Directly connects uncertainty to service-level targets; evaluates transfer learning and cloud workload behavior.
- **Limitations:** Not a foundation model; cross-provider transfer degrades when distributions differ; no video-specific event context.
- **Project research gap:** Use TSFM transfer with calibrated uncertainty and streaming-specific features rather than relying on generic cluster transfer.
- **Source:** https://arxiv.org/abs/2303.13525

## Paper 15: AHPA: Adaptive Horizontal Pod Autoscaling on Alibaba Cloud Kubernetes (2023)

- **Assigned to:** Sujal Agarwal (24BIT0623)
- **Method:** Combines robust decomposition forecasting with a performance model to produce proactive pod-count plans.
- **Dataset/evaluation:** Alibaba production Kubernetes workloads, including logistics, social networks, e-commerce, and AI audio/video scenarios.
- **Advantages:** Operational deployment evidence; reports higher CPU utilization and lower resource cost while maintaining stability.
- **Limitations:** Implementation details and data are platform-specific; does not evaluate modern TSFMs or open streaming benchmarks.
- **Project research gap:** Build a reproducible AWS framework using open models, explicit uncertainty, and transparent cost/SLA metrics.
- **Source:** https://arxiv.org/abs/2303.03640

