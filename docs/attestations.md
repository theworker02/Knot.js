# Attestations

npm can attach Sigstore provenance attestations to a published version. Knot can fetch and verify those statements. It does not treat their presence as publisher identity.

## What is verified

| Check                                  | Meaning                                           | `publisherVerified` |
| -------------------------------------- | ------------------------------------------------- | ------------------- |
| DSSE signature vs embedded certificate | The statement was signed by the key in the bundle | not enough          |
| Subject digest vs stored artifact      | The statement names the bytes Knot has            | not enough          |
| Certificate chain vs trusted roots     | The signer is anchored to a root you supplied     | required            |

`publisherVerified` is true only when all three succeed.

## What is not claimed

- A matching `dist.integrity` or content hash
- `attestationPresent: true` without cryptographic checks
- Fulcio / Rekor public-good trust unless you pin that root yourself

Live registry tests assert the first two checks against real npm bundles and keep `publisherVerified` false when no root is configured.

## API

```ts
const records = await knot.verifyAttestations("sigstore");
console.log(records[0]?.attestationSignatureValid);
console.log(records[0]?.attestationSubjectMatches);
console.log(records[0]?.publisherVerified);
```

`knot inspect <pkg>` fetches attestations when the network is available and prints the same split.
