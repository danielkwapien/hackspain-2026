"""Señales que participan en el score oficial.

Desarrollad y probad módulos por separado. Editad juntos este fichero solo
cuando decidáis que una señal está lista para entrar en el score.
"""

from .activity import SIGNALS as ACTIVITY_SIGNALS
from .collections import SIGNALS as COLLECTION_SIGNALS
from .debt import SIGNALS as DEBT_SIGNALS
from .liquidity import SIGNALS as LIQUIDITY_SIGNALS
from .payment import SIGNALS as PAYMENT_SIGNALS


ACTIVE_SIGNALS = [
    *LIQUIDITY_SIGNALS,
    *PAYMENT_SIGNALS,
    *COLLECTION_SIGNALS,
    *DEBT_SIGNALS,
    *ACTIVITY_SIGNALS,
]
