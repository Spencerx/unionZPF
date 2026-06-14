package grpc

import (
	"context"
	"strings"
	"testing"

	v3 "galois/grpc/api/v3"

	types "github.com/cometbft/cometbft/api/cometbft/types/v1"
)

type pollServer interface {
	Poll(context.Context, *v3.PollRequest) (*v3.PollResponse, error)
}

// Regression test for #5428: Poll must reject any commit with more signatures than
// validators. The guard fires before proving, so a zero-value server (maxJobs == 0) works.
func TestPollSignatureValidatorGuard(t *testing.T) {
	const wantErr = "More signatures than validators"

	oneVal := []*types.SimpleValidator{{}}
	okCommit := func() *v3.ValidatorSetCommit {
		return &v3.ValidatorSetCommit{Validators: oneVal, Signatures: [][]byte{{}}}
	}
	badCommit := func() *v3.ValidatorSetCommit {
		return &v3.ValidatorSetCommit{Validators: oneVal, Signatures: [][]byte{{}, {}}}
	}

	servers := map[string]pollServer{
		"bn254":    &proverServer{},
		"bls12381": &proverServerBls12381{},
	}

	for sName, srv := range servers {
		reqs := map[string]*v3.ProveRequest{
			"trusted":   {TrustedCommit: badCommit(), UntrustedCommit: okCommit()},
			"untrusted": {TrustedCommit: okCommit(), UntrustedCommit: badCommit()},
		}
		for rName, proveReq := range reqs {
			t.Run(sName+"/"+rName, func(t *testing.T) {
				_, err := srv.Poll(context.Background(), &v3.PollRequest{Request: proveReq})
				if err == nil || !strings.Contains(err.Error(), wantErr) {
					t.Fatalf("expected error containing %q, got: %v", wantErr, err)
				}
			})
		}
	}
}
