"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";
import useSWR from "swr";
import type { UIArtifact } from "@/components/chat/artifact";

export const initialArtifactData: UIArtifact = {
  boundingBox: {
    height: 0,
    left: 0,
    top: 0,
    width: 0,
  },
  content: "",
  documentId: "init",
  isVisible: false,
  kind: "text",
  status: "idle",
  title: "",
};

type Selector<T> = (state: UIArtifact) => T;

export type ArtifactMetadata = Record<string, unknown> | null;

export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  const { data: localArtifact } = useSWR<UIArtifact>("artifact", null, {
    dedupingInterval: 0,
    fallbackData: initialArtifactData,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const selectedValue = useMemo(() => {
    if (!localArtifact) {
      return selector(initialArtifactData);
    }
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

export function useArtifact() {
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    "artifact",
    null,
    {
      dedupingInterval: 0,
      fallbackData: initialArtifactData,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const artifact = useMemo(() => {
    if (!localArtifact) {
      return initialArtifactData;
    }
    return localArtifact;
  }, [localArtifact]);

  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      setLocalArtifact((currentArtifact) => {
        const artifactToUpdate = currentArtifact || initialArtifactData;

        if (typeof updaterFn === "function") {
          return updaterFn(artifactToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalArtifact]
  );

  const { data: localArtifactMetadata, mutate: mutateMetadata } =
    useSWR<ArtifactMetadata>(
      () =>
        artifact.documentId ? `artifact-metadata-${artifact.documentId}` : null,
      null,
      {
        dedupingInterval: 0,
        fallbackData: null,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }
    );

  const setMetadata = useCallback(
    (value: SetStateAction<ArtifactMetadata>) => {
      mutateMetadata(
        (current) => {
          const base = current ?? null;
          if (typeof value === "function") {
            return (value as (prev: ArtifactMetadata) => ArtifactMetadata)(
              base
            );
          }
          return value;
        },
        { revalidate: false }
      );
    },
    [mutateMetadata]
  );

  return useMemo(
    () => ({
      artifact,
      metadata: localArtifactMetadata,
      setArtifact,
      setMetadata: setMetadata as unknown as Dispatch<
        SetStateAction<ArtifactMetadata>
      >,
    }),
    [artifact, setArtifact, localArtifactMetadata, setMetadata]
  );
}
