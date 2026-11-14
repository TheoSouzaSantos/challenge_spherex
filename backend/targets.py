# AI-Assisted: the test-target table generated with Claude Code (Anthropic) and reviewed by the team.
"""The five objects the challenge asks us to test on, with where they are and how they move.

Positions and motions come from Gaia DR3 (reference epoch 2016.0). We looked each one up
on the ESA Gaia archive on 2026-11-14 with a small cone search and picked the source whose
proper motion and brightness matched the known object.

WISE 0855-0714 is too faint and cold to be in Gaia. Its position is the one printed in the
challenge text, and its motion comes from the literature (Luhman & Esplin 2016; Kirkpatrick
et al. 2021). The reference epoch for that position (~2010.5) is an estimate, so treat its
predicted track as approximate until it is checked against real SPHEREx frames.
"""

TARGETS = [
    {
        "slug": "barnards-star", "name": "Barnard's Star",
        "aliases": ["barnard", "barnards star", "barnard's star", "gj 699", "gaia dr3 4472832130942575872"],
        "ra": 269.44850252543836, "dec": 4.739420051112412,
        "pmra": -801.5509783684709, "pmdec": 10362.394206546573, "plx": 546.975939730948, "epoch": 2016.0,
        "source": "Gaia DR3 4472832130942575872",
        "dets": [2, 4, 6], "default_det": 2, "kind": "mover",
        "blurb": "The fastest-moving star in our sky: about 10 arcseconds per year.",
    },
    {
        "slug": "epsilon-indi-b", "name": "Epsilon Indi B",
        "aliases": ["epsilon indi b", "eps ind b", "eps indi b", "gaia dr3 6412596012146801152"],
        "ra": 331.07645259656397, "dec": -56.79381206688221,
        "pmra": 3981.97666296105, "pmdec": -2466.8318147663504, "plx": 270.6580324694526, "epoch": 2016.0,
        "source": "Gaia DR3 6412596012146801152",
        "dets": [3, 5, 6], "default_det": 5, "kind": "mover",
        "blurb": "A pair of brown dwarfs orbiting the bright star Epsilon Indi A, 12 light-years away.",
    },
    {
        "slug": "wise-0855", "name": "WISE 0855-0714",
        "aliases": ["wise 0855", "wise0855", "wise 0855-0714", "wise j085510.83-071442.5"],
        "ra": 133.79512916666667, "dec": -7.245147222222222,   # 08h55m10.831s -7d14m42.53s (challenge text)
        "pmra": -8123.7, "pmdec": 673.9, "plx": 439.0, "epoch": 2010.5,
        "source": "Challenge position; motion from literature (approximate epoch)",
        "dets": [2, 5, 6], "default_det": 6, "kind": "mover",
        "blurb": "The coldest known brown dwarf, about as cold as the North Pole. Invisible at short wavelengths.",
    },
    {
        "slug": "rw-aurigae", "name": "RW Aurigae",
        "aliases": ["rw aur", "rw aurigae", "gaia dr3 156430822114424576"],
        "ra": 76.95608119552952, "dec": 30.401204589097233,
        "pmra": 2.6406431770317083, "pmdec": -27.397582540455325, "plx": 6.406249329219477, "epoch": 2016.0,
        "source": "Gaia DR3 156430822114424576",
        "dets": [1, 3, 5], "default_det": 3, "kind": "variable",
        "blurb": "A young star wrapped in a dusty disk; its brightness jumps unpredictably.",
    },
    {
        "slug": "r-draconis", "name": "R Draconis",
        "aliases": ["r dra", "r draconis", "gaia dr3 1648328016354496384"],
        "ra": 248.1673783672889, "dec": 66.75500674547219,
        "pmra": -20.642811719160797, "pmdec": 6.148818852711324, "plx": 1.2509180143740992, "epoch": 2016.0,
        "source": "Gaia DR3 1648328016354496384",
        "dets": [1, 3, 5], "default_det": 3, "kind": "variable",
        "blurb": "A pulsating red giant (Mira variable) that brightens and fades over about 8 months.",
    },
]


# Regions the site also ships ready-made, beyond the challenge's five test targets. They come from the
# saved IRSA snapshot (data/irsa_snapshot), so they work even when IRSA and the API are down.
EXTRAS = [
    {
        "slug": "m31", "name": "Andromeda Galaxy (M31)",
        "aliases": ["m31", "andromeda", "andromeda galaxy", "ngc 224"],
        "ra": 10.6847, "dec": 41.2687,              # galaxy centre, the position of the team's first IRSA query
        "pmra": 0.0, "pmdec": 0.0, "plx": 0.0, "epoch": 2016.0,
        "source": "galaxy centre (SIMBAD position used in the team's IRSA query)",
        "dets": [1, 3, 5], "default_det": 1, "kind": "galaxy",
        "blurb": "Our big neighbour galaxy, 2.5 million light-years away. Nothing here moves, which makes it a good control.",
    },
]

ALL_REGIONS = TARGETS + EXTRAS


def find_target(text):
    q = " ".join(text.lower().replace("_", " ").split())
    for t in ALL_REGIONS:
        if q == t["slug"] or q in t["aliases"]:
            return t
    return None
